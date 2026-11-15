import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'node:path';
import {
  buildContextForNextTurn,
  getActiveWindowStats,
  MAX_CONTEXT_MESSAGES,
} from './src/server/contextWindow.ts';
import {
  closeDb,
  createConversation,
  deleteConversation,
  getConversation,
  getDb,
  getMessages,
  listConversations,
  resetConversation,
  saveMessagePair,
} from './src/server/db.ts';
import {
  GEMINI_MODEL,
  GeminiServiceError,
  generateTutorReply,
  isGeminiConfigured,
} from './src/server/gemini.ts';

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const MAX_MESSAGE_LENGTH = 8000;

export function createApp() {
  const app = express();
  getDb();

  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      model: GEMINI_MODEL,
      apiKeyConfigured: isGeminiConfigured(),
      maxContextMessages: MAX_CONTEXT_MESSAGES,
    });
  });

  app.get('/api/conversations', (_req: Request, res: Response) => {
    const conversations = listConversations();
    res.json({ conversations });
  });

  app.post('/api/conversations', (req: Request, res: Response) => {
    const title = typeof req.body?.title === 'string' ? req.body.title : undefined;
    const conversation = createConversation(title);
    const contextWindow = getActiveWindowStats([]);
    res.status(201).json({
      conversation,
      messages: [],
      contextWindow,
    });
  });

  app.get('/api/conversations/:id', (req: Request, res: Response) => {
    const id = String(req.params.id);
    const conversation = getConversation(id);
    if (!conversation) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Conversation not found.',
          retryable: false,
          status: 404,
        },
      });
      return;
    }

    const messages = getMessages(id);
    const contextWindow = getActiveWindowStats(messages);

    res.json({
      conversation,
      messages,
      contextWindow,
    });
  });

  app.post('/api/conversations/:id/messages', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const conversation = getConversation(id);
      if (!conversation) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Conversation not found.',
            retryable: false,
            status: 404,
          },
        });
        return;
      }

      const rawContent = req.body?.content;
      const content = typeof rawContent === 'string' ? rawContent.trim() : '';

      if (!content) {
        res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'Message content cannot be empty.',
            retryable: false,
            status: 400,
          },
        });
        return;
      }

      if (content.length > MAX_MESSAGE_LENGTH) {
        res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters.`,
            retryable: false,
            status: 400,
          },
        });
        return;
      }

      const existingMessages = getMessages(id);
      const prepared = buildContextForNextTurn(existingMessages);
      const replyText = await generateTutorReply(prepared.historyMessages, content);

      const saved = saveMessagePair(id, content, replyText);
      const updatedMessages = getMessages(id);
      const contextWindow = getActiveWindowStats(updatedMessages);

      res.status(201).json({
        conversation: saved.conversation,
        userMessage: saved.userMessage,
        assistantMessage: saved.assistantMessage,
        messages: updatedMessages,
        contextWindow,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/conversations/:id/reset', (req: Request, res: Response) => {
    const id = String(req.params.id);
    const updated = resetConversation(id);
    if (!updated) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Conversation not found.',
          retryable: false,
          status: 404,
        },
      });
      return;
    }

    res.json({
      conversation: updated,
      messages: [],
      contextWindow: getActiveWindowStats([]),
    });
  });

  app.delete('/api/conversations/:id', (req: Request, res: Response) => {
    const id = String(req.params.id);
    const deleted = deleteConversation(id);
    if (!deleted) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Conversation not found.',
          retryable: false,
          status: 404,
        },
      });
      return;
    }

    res.json({ deleted: true, id });
  });

  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof GeminiServiceError) {
      res.status(err.payload.status).json({ error: err.payload });
      return;
    }

    const message = err instanceof Error ? err.message : 'Unexpected server error.';
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message,
        retryable: true,
        status: 500,
      },
    });
  });

  return app;
}

async function startServer() {
  const app = createApp();
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`SocraticCode server running on http://${HOST}:${PORT} (${isProd ? 'production' : 'development'})`);
  });

  const shutdown = () => {
    server.close(() => {
      closeDb();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const isDirectExecution =
  typeof process.argv[1] === 'string' &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename);

if (isDirectExecution) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
