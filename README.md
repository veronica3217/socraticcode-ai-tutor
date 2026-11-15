# SocraticCode AI Tutor — Multi-Turn Gemini Chatbot

A full-stack, multi-turn AI Programming Tutor built with **React**, **TypeScript**, **Express.js**, **SQLite (`better-sqlite3`)**, and the official **Google Gemini API (`@google/genai`)**.

---

## Architecture Overview

```
+-------------------------------------------------------------------+
|                        React Frontend (Vite)                      |
|  - Sidebar: Multi-session switcher, New Conversation, Delete      |
|  - ChatWorkspace: Markdown + Code blocks, Context Window markers  |
|  - ApiClient (src/services/api.ts): Calls /api/* only (no keys)   |
+---------------------------------+---------------------------------+
                                  | HTTP / JSON
                                  v
+-------------------------------------------------------------------+
|                      Express.js Backend (server.ts)               |
|  - /api/health                Health & key configuration status   |
|  - /api/conversations         List & create sessions (UUID)       |
|  - /api/conversations/:id     Load history & context window stats |
|  - /api/conversations/:id/messages   Multi-turn Gemini exchange   |
|  - /api/conversations/:id/reset      Clear messages for session   |
|  - /api/conversations/:id     Delete session                      |
+-------------------+-----------------------------+-----------------+
                    |                             |
                    v                             v
+-----------------------------------+   +---------------------------+
|   Context Window & SQLite Layer   |   |    Google Gemini Service  |
|   (src/server/contextWindow.ts,   |   |    (src/server/gemini.ts) |
|    src/server/db.ts)              |   |  - Model: gemini-4-       |
|  - WAL-mode SQLite (data/chatbot. |   |    hydrogen               |
|    db)                            |   |  - AI Programming Tutor   |
|  - Transactional pair writes      |   |    systemInstruction      |
|  - Sliding 10-message window      |   |  - Timeout & Retry/429    |
|    preserving complete            |   |    classification         |
|    (user, assistant) pairs        |   +---------------------------+
+-----------------------------------+
```

---

## Key Implementation Decisions

### 1. Pair-Preserving 10-Message Context Window (`src/server/contextWindow.ts`)
- Full conversation logs are stored permanently in SQLite so users can scroll back through their entire session.
- Before calling Gemini, `buildContextForNextTurn()` extracts complete `(user, assistant)` message pairs from the stored history and retains at most the **last 10 messages** (4 prior pairs = 8 history messages + 1 incoming user prompt + 1 upcoming assistant reply = 10 messages total).
- When history exceeds 10 messages, the **oldest complete `(user, assistant)` pair is truncated together** rather than slicing blindly by message count. This guarantees:
  1. History passed to `ai.chats.create({ history })` always begins with a `user` turn and strictly alternates `user` / `model`.
  2. No orphaned assistant replies or half-turns enter the model context.

### 2. Persistent Storage with Transactional Integrity (`src/server/db.ts`)
- Uses `better-sqlite3` with `WAL` journal mode and `foreign_keys = ON`, persisted to `./data/chatbot.db`.
- Each conversation has a unique `crypto.randomUUID()` ID, isolating histories across sessions.
- `(user, assistant)` message pairs are written inside a single SQLite transaction **only after** Gemini responds successfully, preventing failed API calls from leaving dangling unpaired user messages in the database.

### 3. Server-Side Security & Gemini Integration (`src/server/gemini.ts`)
- `GEMINI_API_KEY` is read strictly on the server via `process.env.GEMINI_API_KEY` and is never exposed to frontend bundles or API responses.
- Uses `@google/genai` (`GoogleGenAI`) with `gemini-4-hydrogen` and a dedicated `TUTOR_SYSTEM_INSTRUCTION` defining Socratic, step-by-step programming pedagogy.
- Includes explicit timeout enforcement (`Promise.race` with `GEMINI_TIMEOUT_MS`, default `30000`ms), bounded exponential-backoff retries for transient `429` / `503` errors, and structured error classification (`RATE_LIMIT`, `TIMEOUT`, `NETWORK_ERROR`, `AUTH_ERROR`, `BAD_REQUEST`).

---

## Setup Instructions

### Prerequisites
- **Node.js 22+**
- A valid **Google Gemini API Key**

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Secrets
Set `GEMINI_API_KEY` in your environment (or in **Settings > Secrets** when running in AI Studio):
```bash
export GEMINI_API_KEY="your_gemini_api_key_here"
```
Optional environment variables:
- `PORT` (default `3000`)
- `DB_PATH` (default `./data/chatbot.db`)
- `GEMINI_TIMEOUT_MS` (default `30000`)

### 3. Run in Development
```bash
npm run dev
```
The Express backend + Vite frontend dev middleware will serve on `http://localhost:3000`.

### 4. Build & Run in Production
```bash
npm run build
npm start
```

---

## Verification & Testing

1. **Type-check & Build**:
   ```bash
   npm run lint
   npm run build
   ```
2. **Functional & API Verification**:
   - **Health check**: `GET /api/health` confirms server readiness and `apiKeyConfigured`.
   - **Multi-turn memory (5+ turns)**: Send 5 consecutive turns sharing a variable/fact in Turn 1 and verify Turn 5 recalls it accurately.
   - **Context window truncation (10-message cap)**: Continue past 5 pairs (10+ messages) and verify oldest complete `(user, assistant)` pairs are truncated while preserving valid alternation.
   - **Conversation isolation**: Create a second conversation UUID and verify it has zero knowledge of facts from the first conversation.
   - **Persistence across restart**: Restart the Node server and verify conversations and messages remain intact from `./data/chatbot.db`.
   - **Error handling**: Verify validation (`400`), missing conversation (`404`), invalid key (`403`), timeout (`504`), rate limit (`429`), and network errors (`503`) return structured error payloads.
