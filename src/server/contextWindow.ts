import type { ContextWindowStats, Message } from './types.ts';

export const MAX_CONTEXT_MESSAGES = 10;

export interface MessagePair {
  user: Message;
  assistant: Message;
}

export interface PreparedContextWindow {
  historyMessages: Message[];
  stats: ContextWindowStats;
}

/**
 * Groups raw chronological messages into complete (user, assistant) pairs.
 * Any orphaned message (e.g., an assistant turn without a preceding user turn
 * or an unpaired trailing user turn) is excluded from paired history so the LLM
 * always receives strictly alternating, complete conversational turns.
 */
export function extractCompletePairs(messages: Message[]): MessagePair[] {
  const pairs: MessagePair[] = [];
  let pendingUser: Message | null = null;

  for (const msg of messages) {
    if (msg.role === 'user') {
      pendingUser = msg;
    } else if (msg.role === 'assistant' && pendingUser !== null) {
      pairs.push({ user: pendingUser, assistant: msg });
      pendingUser = null;
    }
  }

  return pairs;
}

/**
 * Computes the active context window for viewing a conversation.
 * Keeps up to `maxMessages` (default 10) while preserving complete
 * user-assistant pairs.
 */
export function getActiveWindowStats(
  messages: Message[],
  maxMessages: number = MAX_CONTEXT_MESSAGES
): ContextWindowStats {
  const safeMax = Math.max(2, Math.floor(maxMessages / 2) * 2);
  const maxPairs = safeMax / 2;
  const allPairs = extractCompletePairs(messages);
  const activePairs = allPairs.slice(-maxPairs);
  const truncatedPairs = Math.max(0, allPairs.length - activePairs.length);
  const activeMessagesList = activePairs.flatMap((pair) => [pair.user, pair.assistant]);

  return {
    maxMessages: safeMax,
    totalMessages: messages.length,
    activeMessages: activeMessagesList.length,
    activePairs: activePairs.length,
    truncatedMessages: Math.max(0, messages.length - activeMessagesList.length),
    truncatedPairs,
    activeMessageIds: activeMessagesList.map((m) => m.id),
  };
}

/**
 * Prepares the prior history sent to Gemini when a new user message arrives.
 * Because the incoming turn adds 1 user message + 1 assistant reply (2 messages),
 * we reserve 2 slots out of `maxMessages` (10) so the resulting turn stays
 * within the 10-message context window and always truncates by whole pairs.
 */
export function buildContextForNextTurn(
  existingMessages: Message[],
  maxMessages: number = MAX_CONTEXT_MESSAGES
): PreparedContextWindow {
  const safeMax = Math.max(2, Math.floor(maxMessages / 2) * 2);
  const maxPriorPairs = Math.max(0, safeMax / 2 - 1);
  const allPairs = extractCompletePairs(existingMessages);
  const keptPairs = maxPriorPairs > 0 ? allPairs.slice(-maxPriorPairs) : [];
  const truncatedPairs = Math.max(0, allPairs.length - keptPairs.length);
  const historyMessages = keptPairs.flatMap((pair) => [pair.user, pair.assistant]);

  return {
    historyMessages,
    stats: {
      maxMessages: safeMax,
      totalMessages: existingMessages.length,
      activeMessages: historyMessages.length,
      activePairs: keptPairs.length,
      truncatedMessages: Math.max(0, existingMessages.length - historyMessages.length),
      truncatedPairs,
      activeMessageIds: historyMessages.map((m) => m.id),
    },
  };
}
