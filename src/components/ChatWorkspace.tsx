import {
  AlertCircle,
  BookOpen,
  Menu,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type {
  ApiErrorInfo,
  ContextWindowStats,
  Conversation,
  Message,
} from '../types/chat';
import { MarkdownMessage } from './MarkdownMessage';

interface ChatWorkspaceProps {
  conversation: Conversation | null;
  messages: Message[];
  contextWindow: ContextWindowStats | null;
  isLoadingConversation: boolean;
  isSending: boolean;
  error: ApiErrorInfo | null;
  failedPrompt: string | null;
  apiKeyConfigured: boolean | null;
  onOpenSidebar: () => void;
  onSendMessage: (content: string) => void;
  onRetryFailed: () => void;
  onDismissError: () => void;
  onResetConversation: () => void;
  onNewConversation: () => void;
}

const STARTER_PROMPTS = [
  {
    title: 'Explain Recursion Step-by-Step',
    prompt: 'Can you explain recursion in Python using a simple call-stack trace and base case example?',
  },
  {
    title: 'Debug Async/Await Race Conditions',
    prompt: 'Why does Promise.all fail fast in JavaScript, and when should I use Promise.allSettled instead?',
  },
  {
    title: 'Understand Big-O Time Complexity',
    prompt: 'Compare O(n log n) vs O(n^2) sorting algorithms and show when insertion sort is actually faster.',
  },
  {
    title: 'Master SQL INNER vs LEFT JOIN',
    prompt: 'Teach me the difference between INNER JOIN and LEFT JOIN in SQL with two small example tables.',
  },
];

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ChatWorkspace({
  conversation,
  messages,
  contextWindow,
  isLoadingConversation,
  isSending,
  error,
  failedPrompt,
  apiKeyConfigured,
  onOpenSidebar,
  onSendMessage,
  onRetryFailed,
  onDismissError,
  onResetConversation,
  onNewConversation,
}: ChatWorkspaceProps) {
  const [input, setInput] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isSending, error]);

  useEffect(() => {
    setConfirmReset(false);
  }, [conversation?.id]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    setInput('');
    onSendMessage(trimmed);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || isSending) return;
      setInput('');
      onSendMessage(trimmed);
    }
  };

  const activeIdSet = new Set(contextWindow?.activeMessageIds ?? []);
  const firstActiveIndex =
    contextWindow && contextWindow.truncatedMessages > 0
      ? messages.findIndex((m) => activeIdSet.has(m.id))
      : -1;

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-slate-50">
      {/* Header following 3-zone clarity */}
      <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenSidebar}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 lg:hidden"
            aria-label="Open conversation list"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>

          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-900 sm:text-lg">
              {conversation ? conversation.title : 'AI Programming Tutor'}
            </h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 tabular-nums">
              <span>AI Programming Tutor</span>
              {contextWindow && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    {contextWindow.activeMessages} / {contextWindow.maxMessages} context messages
                  </span>
                  {contextWindow.truncatedPairs > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        {contextWindow.truncatedPairs} earlier{' '}
                        {contextWindow.truncatedPairs === 1 ? 'pair' : 'pairs'} archived
                      </span>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {conversation && messages.length > 0 && (
            confirmReset ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmReset(false);
                    onResetConversation();
                  }}
                  disabled={isSending}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  Confirm Reset
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="inline-flex min-h-[40px] items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                disabled={isSending}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 whitespace-nowrap shrink-0"
                title="Clear all messages in this session"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Reset</span>
              </button>
            )
          )}

          <button
            type="button"
            onClick={onNewConversation}
            disabled={isSending}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>New Chat</span>
          </button>
        </div>
      </header>

      {/* Server secret configuration notice if missing */}
      {apiKeyConfigured === false && (
        <div
          role="alert"
          className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:px-6"
        >
          <div className="mx-auto flex max-w-3xl items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
            <p>
              Server notice: <code className="font-mono text-xs">GEMINI_API_KEY</code> is not set in the
              server environment. Add your key in <strong>Settings &gt; Secrets</strong> to enable live
              Gemini tutor responses.
            </p>
          </div>
        </div>
      )}

      {/* Main Message Viewport */}
      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {isLoadingConversation ? (
            <div className="space-y-4 py-8" aria-busy="true" aria-label="Loading conversation">
              <div className="h-16 w-3/4 animate-pulse rounded-xl bg-slate-200/70" />
              <div className="ml-auto h-12 w-1/2 animate-pulse rounded-xl bg-slate-200/70" />
              <div className="h-24 w-4/5 animate-pulse rounded-xl bg-slate-200/70" />
            </div>
          ) : messages.length === 0 ? (
            <section className="py-6 sm:py-10">
              <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
                <div className="flex items-center gap-2.5 text-sky-700">
                  <BookOpen className="h-5 w-5" aria-hidden="true" />
                  <span className="text-sm font-semibold">AI Programming Tutor</span>
                </div>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 text-balance">
                  Learn algorithms, debugging, and architecture step by step.
                </h2>
                <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-slate-600">
                  Ask a programming question, paste a code snippet to debug, or test multi-turn
                  problem solving. Every session preserves up to the last 10 messages in complete
                  user-assistant pairs and persists automatically across restarts.
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {STARTER_PROMPTS.map((item) => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => onSendMessage(item.prompt)}
                      disabled={isSending}
                      className="flex flex-col items-start rounded-lg border border-slate-200 bg-slate-50/70 p-4 text-left transition-colors hover:border-sky-300 hover:bg-sky-50/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:opacity-50"
                    >
                      <span className="text-sm font-semibold text-slate-900">{item.title}</span>
                      <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">
                        {item.prompt}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          ) : (
            <div className="space-y-5">
              {messages.map((msg, idx) => {
                const isUser = msg.role === 'user';
                const showWindowBoundary = firstActiveIndex > 0 && idx === firstActiveIndex;
                const isArchived = firstActiveIndex > 0 && idx < firstActiveIndex;

                return (
                  <div key={msg.id}>
                    {showWindowBoundary && (
                      <div className="my-6 flex items-center gap-3 text-xs text-slate-500">
                        <div className="h-px flex-1 bg-slate-200" />
                        <span className="whitespace-nowrap">
                          Active context window begins here (last {contextWindow?.maxMessages ?? 10}{' '}
                          messages)
                        </span>
                        <div className="h-px flex-1 bg-slate-200" />
                      </div>
                    )}

                    <article
                      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} ${
                        isArchived ? 'opacity-70' : ''
                      }`}
                    >
                      <div className="mb-1.5 flex items-center gap-2 text-xs text-slate-500 tabular-nums">
                        <span className="font-medium text-slate-700">
                          {isUser ? 'You' : 'Programming Tutor'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{formatTimestamp(msg.createdAt)}</span>
                        {isArchived && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>Archived from context</span>
                          </>
                        )}
                      </div>

                      {isUser ? (
                        <div className="max-w-[85%] rounded-2xl bg-sky-700 px-4 py-3 text-[15px] leading-relaxed text-white sm:max-w-[75%]">
                          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                        </div>
                      ) : (
                        <div className="w-full max-w-[92%] rounded-2xl border border-slate-200 bg-white px-5 py-4 sm:max-w-[88%]">
                          <MarkdownMessage content={msg.content} />
                        </div>
                      )}
                    </article>
                  </div>
                );
              })}
            </div>
          )}

          {/* Loading Indicator */}
          {isSending && (
            <div
              className="flex flex-col items-start"
              role="status"
              aria-live="polite"
              aria-label="Tutor is generating a response"
            >
              <div className="mb-1.5 flex items-center gap-2 text-xs text-slate-500">
                <span className="font-medium text-slate-700">Programming Tutor</span>
                <span aria-hidden="true">·</span>
                <span>Thinking</span>
              </div>
              <div className="inline-flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-sm text-slate-600">
                <span className="inline-flex gap-1" aria-hidden="true">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-sky-700 [animation-delay:-0.2s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-sky-700 [animation-delay:-0.1s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-sky-700" />
                </span>
                <span>Drafting explanation and code examples...</span>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
                  <div>
                    <p className="font-semibold text-red-950">
                      {error.code === 'RATE_LIMIT'
                        ? 'Rate limit reached'
                        : error.code === 'TIMEOUT'
                          ? 'Request timed out'
                          : error.code === 'NETWORK_ERROR'
                            ? 'Network connection issue'
                            : error.code === 'AUTH_ERROR'
                              ? 'API authentication error'
                              : 'Unable to complete request'}
                    </p>
                    <p className="mt-1 leading-relaxed text-red-800">{error.message}</p>
                    {error.retryable && failedPrompt && (
                      <button
                        type="button"
                        onClick={onRetryFailed}
                        disabled={isSending}
                        className="mt-3 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-800 disabled:opacity-50"
                      >
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Retry Last Message</span>
                      </button>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onDismissError}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-red-700 hover:bg-red-100"
                  aria-label="Dismiss error"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Composer */}
      <footer className="border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
        <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2.5 rounded-xl border border-slate-300 bg-white p-2 focus-within:border-sky-600 focus-within:ring-2 focus-within:ring-sky-600/15">
            <label htmlFor="chat-composer" className="sr-only">
              Ask your AI programming tutor
            </label>
            <textarea
              id="chat-composer"
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSending}
              placeholder="Ask a programming question or paste code to debug... (Enter to send, Shift+Enter for new line)"
              className="max-h-[180px] min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={isSending || !input.trim()}
              className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 whitespace-nowrap"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              <span>{isSending ? 'Sending...' : 'Send'}</span>
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-between px-1 text-xs text-slate-500">
            <span>Enter to send · Shift+Enter for newline</span>
            <span className="tabular-nums">{input.length} / 8000</span>
          </div>
        </form>
      </footer>
    </div>
  );
}
