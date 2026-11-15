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

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'AUTH_ERROR'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'INTERNAL_ERROR';

export interface ApiErrorPayload {
  code: ApiErrorCode;
  message: string;
  retryable: boolean;
  status: number;
}
