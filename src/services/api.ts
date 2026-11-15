import type {
  ApiErrorInfo,
  Conversation,
  ConversationDetailResponse,
  HealthResponse,
  SendMessageResponse,
} from '../types/chat';

export class ApiClientError extends Error {
  public readonly info: ApiErrorInfo;

  constructor(info: ApiErrorInfo) {
    super(info.message);
    this.name = 'ApiClientError';
    this.info = info;
  }
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (!response.ok) {
    if (isJson) {
      const data = (await response.json().catch(() => null)) as { error?: ApiErrorInfo } | null;
      if (data?.error) {
        throw new ApiClientError(data.error);
      }
    }
    throw new ApiClientError({
      code: response.status === 429 ? 'RATE_LIMIT' : response.status === 504 ? 'TIMEOUT' : 'INTERNAL_ERROR',
      message: `Request failed with status ${response.status}. Please try again.`,
      retryable: response.status >= 500 || response.status === 429,
      status: response.status,
    });
  }

  return (await response.json()) as T;
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(input, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });
    return await parseJsonResponse<T>(response);
  } catch (err) {
    if (err instanceof ApiClientError) {
      throw err;
    }
    throw new ApiClientError({
      code: 'NETWORK_ERROR',
      message: 'Network connection failed while reaching the server. Check your connection and retry.',
      retryable: true,
      status: 0,
    });
  }
}

export async function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>('/api/health');
}

export async function fetchConversations(): Promise<Conversation[]> {
  const data = await requestJson<{ conversations: Conversation[] }>('/api/conversations');
  return data.conversations;
}

export async function createConversation(title?: string): Promise<ConversationDetailResponse> {
  return requestJson<ConversationDetailResponse>('/api/conversations', {
    method: 'POST',
    body: JSON.stringify(title ? { title } : {}),
  });
}

export async function fetchConversationDetail(id: string): Promise<ConversationDetailResponse> {
  return requestJson<ConversationDetailResponse>(`/api/conversations/${encodeURIComponent(id)}`);
}

export async function sendChatMessage(id: string, content: string): Promise<SendMessageResponse> {
  return requestJson<SendMessageResponse>(`/api/conversations/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

export async function resetConversationSession(id: string): Promise<ConversationDetailResponse> {
  return requestJson<ConversationDetailResponse>(`/api/conversations/${encodeURIComponent(id)}/reset`, {
    method: 'POST',
  });
}

export async function deleteConversationSession(id: string): Promise<{ deleted: boolean; id: string }> {
  return requestJson<{ deleted: boolean; id: string }>(`/api/conversations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
