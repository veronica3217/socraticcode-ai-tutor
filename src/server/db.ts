import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Conversation, Message } from './types.ts';

const DEFAULT_CONVERSATION_TITLE = 'New Tutoring Session';

let dbInstance: Database.Database | null = null;

function resolveDbPath(): string {
  if (process.env.DB_PATH && process.env.DB_PATH.trim().length > 0) {
    return path.resolve(process.env.DB_PATH);
  }
  return path.resolve(process.cwd(), 'data', 'chatbot.db');
}

export function getDb(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = resolveDbPath();
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation_order
      ON messages(conversation_id, created_at ASC);
  `);

  dbInstance = db;
  return db;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

function deriveTitleFromPrompt(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return DEFAULT_CONVERSATION_TITLE;
  }
  if (cleaned.length <= 48) {
    return cleaned;
  }
  return `${cleaned.slice(0, 45).trimEnd()}...`;
}

export function listConversations(): Conversation[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT
        c.id,
        c.title,
        c.created_at AS createdAt,
        c.updated_at AS updatedAt,
        COUNT(m.id) AS messageCount
      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
      GROUP BY c.id
      ORDER BY c.updated_at DESC, c.rowid DESC
      `
    )
    .all() as Conversation[];

  return rows;
}

export function getConversation(id: string): Conversation | null {
  const db = getDb();
  const row = db
    .prepare(
      `
      SELECT
        c.id,
        c.title,
        c.created_at AS createdAt,
        c.updated_at AS updatedAt,
        COUNT(m.id) AS messageCount
      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
      WHERE c.id = ?
      GROUP BY c.id
      `
    )
    .get(id) as Conversation | undefined;

  return row ?? null;
}

export function createConversation(title?: string): Conversation {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const resolvedTitle = title && title.trim().length > 0 ? title.trim() : DEFAULT_CONVERSATION_TITLE;

  db.prepare(
    `
    INSERT INTO conversations (id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    `
  ).run(id, resolvedTitle, now, now);

  return {
    id,
    title: resolvedTitle,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
  };
}

export function getMessages(conversationId: string): Message[] {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT
        id,
        conversation_id AS conversationId,
        role,
        content,
        created_at AS createdAt
      FROM messages
      WHERE conversation_id = ?
      ORDER BY rowid ASC
      `
    )
    .all(conversationId) as Message[];
}

export function saveMessagePair(
  conversationId: string,
  userContent: string,
  assistantContent: string
): { conversation: Conversation; userMessage: Message; assistantMessage: Message } {
  const db = getDb();

  const runTx = db.transaction(() => {
    const existing = getConversation(conversationId);
    if (!existing) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const nowMs = Date.now();
    const userTime = new Date(nowMs).toISOString();
    const assistantTime = new Date(nowMs + 1).toISOString();

    const userMessage: Message = {
      id: crypto.randomUUID(),
      conversationId,
      role: 'user',
      content: userContent,
      createdAt: userTime,
    };

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      conversationId,
      role: 'assistant',
      content: assistantContent,
      createdAt: assistantTime,
    };

    const insertMsg = db.prepare(
      `
      INSERT INTO messages (id, conversation_id, role, content, created_at)
      VALUES (?, ?, ?, ?, ?)
      `
    );

    insertMsg.run(
      userMessage.id,
      userMessage.conversationId,
      userMessage.role,
      userMessage.content,
      userMessage.createdAt
    );
    insertMsg.run(
      assistantMessage.id,
      assistantMessage.conversationId,
      assistantMessage.role,
      assistantMessage.content,
      assistantMessage.createdAt
    );

    const nextTitle =
      existing.messageCount === 0 && existing.title === DEFAULT_CONVERSATION_TITLE
        ? deriveTitleFromPrompt(userContent)
        : existing.title;

    db.prepare(
      `
      UPDATE conversations
      SET title = ?, updated_at = ?
      WHERE id = ?
      `
    ).run(nextTitle, assistantTime, conversationId);

    const updatedConversation = getConversation(conversationId)!;
    return {
      conversation: updatedConversation,
      userMessage,
      assistantMessage,
    };
  });

  return runTx();
}

export function resetConversation(conversationId: string): Conversation | null {
  const db = getDb();

  const runTx = db.transaction(() => {
    const existing = getConversation(conversationId);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conversationId);
    db.prepare(
      `
      UPDATE conversations
      SET title = ?, updated_at = ?
      WHERE id = ?
      `
    ).run(DEFAULT_CONVERSATION_TITLE, now, conversationId);

    return getConversation(conversationId);
  });

  return runTx();
}

export function deleteConversation(conversationId: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM conversations WHERE id = ?').run(conversationId);
  return result.changes > 0;
}
