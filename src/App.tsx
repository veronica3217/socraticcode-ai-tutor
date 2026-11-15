import { useCallback, useEffect, useState } from 'react';
import { ChatWorkspace } from './components/ChatWorkspace';
import { Sidebar } from './components/Sidebar';
import {
  ApiClientError,
  createConversation,
  deleteConversationSession,
  fetchConversationDetail,
  fetchConversations,
  fetchHealth,
  resetConversationSession,
  sendChatMessage,
} from './services/api';
import type {
  ApiErrorInfo,
  ContextWindowStats,
  Conversation,
  Message,
} from './types/chat';

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [contextWindow, setContextWindow] = useState<ContextWindowStats | null>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<ApiErrorInfo | null>(null);
  const [failedPrompt, setFailedPrompt] = useState<string | null>(null);
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean | null>(null);

  const loadConversation = useCallback(async (id: string) => {
    setIsLoadingConversation(true);
    setError(null);
    setFailedPrompt(null);
    try {
      const detail = await fetchConversationDetail(id);
      setActiveId(detail.conversation.id);
      setActiveConversation(detail.conversation);
      setMessages(detail.messages);
      setContextWindow(detail.contextWindow);
      window.localStorage.setItem('activeConversationId', detail.conversation.id);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.info);
      }
    } finally {
      setIsLoadingConversation(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const [health, list] = await Promise.all([
          fetchHealth().catch(() => null),
          fetchConversations(),
        ]);

        if (cancelled) return;
        if (health) {
          setApiKeyConfigured(health.apiKeyConfigured);
        }

        if (list.length === 0) {
          const created = await createConversation();
          if (cancelled) return;
          setConversations([created.conversation]);
          setActiveId(created.conversation.id);
          setActiveConversation(created.conversation);
          setMessages(created.messages);
          setContextWindow(created.contextWindow);
          window.localStorage.setItem('activeConversationId', created.conversation.id);
          setIsLoadingConversation(false);
          return;
        }

        setConversations(list);
        const savedId = window.localStorage.getItem('activeConversationId');
        const initialId = list.some((c) => c.id === savedId) ? savedId! : list[0].id;
        await loadConversation(initialId);
      } catch (err) {
        if (cancelled) return;
        setIsLoadingConversation(false);
        if (err instanceof ApiClientError) {
          setError(err.info);
        }
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [loadConversation]);

  const handleNewConversation = async () => {
    if (isCreating || isSending) return;
    setIsCreating(true);
    setError(null);
    setFailedPrompt(null);
    try {
      const created = await createConversation();
      setConversations((prev) => [created.conversation, ...prev]);
      setActiveId(created.conversation.id);
      setActiveConversation(created.conversation);
      setMessages(created.messages);
      setContextWindow(created.contextWindow);
      window.localStorage.setItem('activeConversationId', created.conversation.id);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.info);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleSelectConversation = async (id: string) => {
    if (id === activeId || isSending) return;
    await loadConversation(id);
  };

  const handleSendMessage = async (content: string) => {
    if (isSending) return;
    setError(null);
    setFailedPrompt(null);

    let targetId = activeId;
    if (!targetId) {
      try {
        const created = await createConversation();
        setConversations((prev) => [created.conversation, ...prev]);
        targetId = created.conversation.id;
        setActiveId(targetId);
        setActiveConversation(created.conversation);
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.info);
          setFailedPrompt(content);
        }
        return;
      }
    }

    const optimisticUserMsg: Message = {
      id: `temp-${Date.now()}`,
      conversationId: targetId,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };

    const previousMessages = messages;
    setMessages((prev) => [...prev, optimisticUserMsg]);
    setIsSending(true);

    try {
      const result = await sendChatMessage(targetId, content);
      setActiveConversation(result.conversation);
      setMessages(result.messages);
      setContextWindow(result.contextWindow);
      setConversations((prev) => {
        const without = prev.filter((c) => c.id !== result.conversation.id);
        return [result.conversation, ...without];
      });
    } catch (err) {
      setMessages(previousMessages);
      setFailedPrompt(content);
      if (err instanceof ApiClientError) {
        setError(err.info);
      } else {
        setError({
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred while sending your message.',
          retryable: true,
          status: 500,
        });
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleRetryFailed = () => {
    if (!failedPrompt || isSending) return;
    const promptToRetry = failedPrompt;
    setFailedPrompt(null);
    setError(null);
    void handleSendMessage(promptToRetry);
  };

  const handleResetConversation = async () => {
    if (!activeId || isSending) return;
    setError(null);
    setFailedPrompt(null);
    try {
      const result = await resetConversationSession(activeId);
      setActiveConversation(result.conversation);
      setMessages(result.messages);
      setContextWindow(result.contextWindow);
      setConversations((prev) =>
        prev.map((c) => (c.id === result.conversation.id ? result.conversation : c))
      );
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.info);
      }
    }
  };

  const handleDeleteConversation = async (id: string) => {
    if (isSending) return;
    setError(null);
    try {
      await deleteConversationSession(id);
      const remaining = conversations.filter((c) => c.id !== id);
      setConversations(remaining);

      if (activeId === id) {
        if (remaining.length > 0) {
          await loadConversation(remaining[0].id);
        } else {
          const created = await createConversation();
          setConversations([created.conversation]);
          setActiveId(created.conversation.id);
          setActiveConversation(created.conversation);
          setMessages(created.messages);
          setContextWindow(created.contextWindow);
          window.localStorage.setItem('activeConversationId', created.conversation.id);
        }
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.info);
      }
    }
  };

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-slate-50 text-slate-900">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        isOpen={isSidebarOpen}
        isCreating={isCreating}
        onClose={() => setIsSidebarOpen(false)}
        onSelect={handleSelectConversation}
        onCreate={handleNewConversation}
        onDelete={handleDeleteConversation}
      />

      <ChatWorkspace
        conversation={activeConversation}
        messages={messages}
        contextWindow={contextWindow}
        isLoadingConversation={isLoadingConversation}
        isSending={isSending}
        error={error}
        failedPrompt={failedPrompt}
        apiKeyConfigured={apiKeyConfigured}
        onOpenSidebar={() => setIsSidebarOpen(true)}
        onSendMessage={handleSendMessage}
        onRetryFailed={handleRetryFailed}
        onDismissError={() => {
          setError(null);
          setFailedPrompt(null);
        }}
        onResetConversation={handleResetConversation}
        onNewConversation={handleNewConversation}
      />
    </div>
  );
}
