export type MessageRole = 'user' | 'assistant';

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

export interface ContextWindowStats {
  maxMessages: number;
  totalMessages: number;
  activeMessages: number;
  activePairs: number;
  truncatedMessages: number;
  truncatedPairs: number;
  activeMessageIds: string[];
}

export interface ApiErrorInfo {
  code:
    | 'BAD_REQUEST'
    | 'NOT_FOUND'
    | 'AUTH_ERROR'
    | 'RATE_LIMIT'
    | 'TIMEOUT'
    | 'NETWORK_ERROR'
    | 'INTERNAL_ERROR';
  message: string;
  retryable: boolean;
  status: number;
}

export interface ConversationDetailResponse {
  conversation: Conversation;
  messages: Message[];
  contextWindow: ContextWindowStats;
}

export interface SendMessageResponse {
  conversation: Conversation;
  userMessage: Message;
  assistantMessage: Message;
  messages: Message[];
  contextWindow: ContextWindowStats;
}

export interface HealthResponse {
  ok: boolean;
  model: string;
  apiKeyConfigured: boolean;
  maxContextMessages: number;
}
