import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { Content } from '@google/genai';
import type { ApiErrorPayload, Message } from './types.ts';

export const GEMINI_MODEL = 'gemini-4-hydrogen';

export const TUTOR_SYSTEM_INSTRUCTION = `You are SocraticCode, an expert, patient, and rigorous AI Programming Tutor.

Your teaching philosophy:
1. Build genuine understanding: Explain *why* a concept or fix works, not just *what* to type.
2. Guide step-by-step: Break complex topics (algorithms, debugging, architecture, language semantics) into clear, progressive steps.
3. Use clean, runnable code examples: Always tag fenced code blocks with the language (e.g. \`\`\`typescript, \`\`\`python, \`\`\`sql) and keep snippets focused and readable.
4. Socratic check-ins: When helpful, end with a concise follow-up question or small exercise to check the student's understanding.
5. Context honesty: Rely strictly on what has been shared in the current conversation context. If the student asks about something from earlier turns that is no longer in your active context window or wasn't mentioned, clearly say you don't have that information in your current context rather than guessing.`;

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_RETRY_ATTEMPTS = 2;

export class GeminiServiceError extends Error {
  public readonly payload: ApiErrorPayload;

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'GeminiServiceError';
    this.payload = payload;
  }
}

export function isGeminiConfigured(): boolean {
  return typeof process.env.GEMINI_API_KEY === 'string' && process.env.GEMINI_API_KEY.trim().length > 0;
}

function getTimeoutMs(): number {
  const parsed = Number(process.env.GEMINI_TIMEOUT_MS);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_TIMEOUT_MS;
}

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new GeminiServiceError({
      code: 'AUTH_ERROR',
      message:
        'Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets and restart the server.',
      retryable: false,
      status: 403,
    });
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function toGeminiHistory(messages: Message[]): Content[] {
  return messages.map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));
}

export function classifyGeminiError(error: unknown): GeminiServiceError {
  if (error instanceof GeminiServiceError) {
    return error;
  }

  const errObj = error as {
    status?: number;
    statusCode?: number;
    code?: string;
    name?: string;
    message?: string;
    cause?: { code?: string; message?: string };
  };

  const rawMessage = errObj?.message || 'Unexpected error communicating with Gemini API.';
  const upperMsg = rawMessage.toUpperCase();
  const status = errObj?.status ?? errObj?.statusCode;
  const sysCode = errObj?.code ?? errObj?.cause?.code ?? '';

  if (
    errObj?.name === 'AbortError' ||
    errObj?.name === 'TimeoutError' ||
    sysCode === 'ETIMEDOUT' ||
    sysCode === 'UND_ERR_HEADERS_TIMEOUT' ||
    upperMsg.includes('TIMED OUT') ||
    upperMsg.includes('TIMEOUT')
  ) {
    return new GeminiServiceError({
      code: 'TIMEOUT',
      message:
        'The AI tutor took too long to respond and the request timed out. Please try sending your message again.',
      retryable: true,
      status: 504,
    });
  }

  if (
    status === 429 ||
    upperMsg.includes('RESOURCE_EXHAUSTED') ||
    upperMsg.includes('RATE LIMIT') ||
    upperMsg.includes('QUOTA')
  ) {
    return new GeminiServiceError({
      code: 'RATE_LIMIT',
      message:
        'Gemini API rate limit or quota reached. Wait a few seconds and retry, or check your quota in Settings > Secrets.',
      retryable: true,
      status: 429,
    });
  }

  if (
    status === 401 ||
    status === 403 ||
    upperMsg.includes('PERMISSION_DENIED') ||
    upperMsg.includes('API_KEY_INVALID') ||
    upperMsg.includes('API KEY NOT VALID') ||
    upperMsg.includes('UNAUTHENTICATED')
  ) {
    return new GeminiServiceError({
      code: 'AUTH_ERROR',
      message:
        'Gemini API authentication failed. Please verify your GEMINI_API_KEY in Settings > Secrets.',
      retryable: false,
      status: 403,
    });
  }

  if (
    status === 503 ||
    status === 502 ||
    sysCode === 'ECONNREFUSED' ||
    sysCode === 'ENOTFOUND' ||
    sysCode === 'ECONNRESET' ||
    sysCode === 'EAI_AGAIN' ||
    upperMsg.includes('FETCH FAILED') ||
    upperMsg.includes('NETWORK') ||
    upperMsg.includes('UNAVAILABLE')
  ) {
    return new GeminiServiceError({
      code: 'NETWORK_ERROR',
      message:
        'Unable to reach the Gemini API due to a network or upstream service issue. Please try again shortly.',
      retryable: true,
      status: 503,
    });
  }

  if (status === 400 || upperMsg.includes('INVALID_ARGUMENT')) {
    return new GeminiServiceError({
      code: 'BAD_REQUEST',
      message: `The request could not be processed by Gemini: ${rawMessage}`,
      retryable: false,
      status: 400,
    });
  }

  return new GeminiServiceError({
    code: 'INTERNAL_ERROR',
    message: `Failed to generate a tutor response: ${rawMessage}`,
    retryable: true,
    status: 502,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new GeminiServiceError({
          code: 'TIMEOUT',
          message: `The AI tutor did not respond within ${Math.round(timeoutMs / 1000)}s. Please try again.`,
          retryable: true,
          status: 504,
        })
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function generateTutorReply(
  historyMessages: Message[],
  userPrompt: string
): Promise<string> {
  const ai = createGeminiClient();
  const history = toGeminiHistory(historyMessages);
  const timeoutMs = getTimeoutMs();

  let lastError: GeminiServiceError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const chat = ai.chats.create({
        model: GEMINI_MODEL,
        history,
        config: {
          systemInstruction: TUTOR_SYSTEM_INSTRUCTION,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
        },
      });

      const response = await sendWithTimeout(
        chat.sendMessage({ message: userPrompt }),
        timeoutMs
      );

      const text = response.text?.trim();
      if (!text) {
        throw new GeminiServiceError({
          code: 'INTERNAL_ERROR',
          message: 'Gemini returned an empty response. Please rephrase or try again.',
          retryable: true,
          status: 502,
        });
      }

      return text;
    } catch (err) {
      const classified = classifyGeminiError(err);
      lastError = classified;

      // Retry only transient rate-limit or network errors within remaining budget
      const shouldRetry =
        attempt < MAX_RETRY_ATTEMPTS &&
        (classified.payload.code === 'RATE_LIMIT' || classified.payload.code === 'NETWORK_ERROR');

      if (!shouldRetry) {
        throw classified;
      }

      const backoffMs = 400 * Math.pow(2, attempt);
      await sleep(backoffMs);
    }
  }

  throw lastError!;
}
