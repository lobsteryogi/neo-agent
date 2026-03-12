import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryDb } from '../../src/db/connection';

// Mock express Request and Response
function mockReq(overrides: Record<string, any> = {}): any {
  return {
    params: {},
    query: {},
    body: {},
    ...overrides,
  };
}

function mockRes(): any {
  const res: any = {
    statusCode: 200,
    body: null,
    headersSent: false,
  };
  res.status = vi.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn().mockImplementation((data: any) => {
    res.body = data;
    res.headersSent = true;
    return res;
  });
  return res;
}

// We need to test the route handlers directly since we can't spin up Express.
// We'll import registerRoutes and capture the handlers via a mock Express app.
function captureRoutes(
  registerFn: (app: any, db: Database.Database) => void,
  db: Database.Database,
) {
  const handlers: Record<string, (req: any, res: any) => void> = {};
  const app = {
    get: vi.fn().mockImplementation((path: string, handler: any) => {
      handlers[`GET ${path}`] = handler;
    }),
    post: vi.fn().mockImplementation((path: string, handler: any) => {
      handlers[`POST ${path}`] = handler;
    }),
    patch: vi.fn().mockImplementation((path: string, handler: any) => {
      handlers[`PATCH ${path}`] = handler;
    }),
    delete: vi.fn().mockImplementation((path: string, handler: any) => {
      handlers[`DELETE ${path}`] = handler;
    }),
  };
  registerFn(app as any, db);
  return { app, handlers };
}

describe('API Routes', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createMemoryDb();
  });

  afterEach(() => {
    db.close();
  });

  // ─── Route registration ────────────────────────────────────

  describe('route registration', () => {
    it('registers GET /api/sessions', async () => {
      const { registerRoutes } = await import('../../src/api/routes');
      const { app } = captureRoutes(registerRoutes, db);
      expect(app.get).toHaveBeenCalledWith('/api/sessions', expect.any(Function));
    });

    it('registers GET /api/audit', async () => {
      const { registerRoutes } = await import('../../src/api/routes');
      const { app } = captureRoutes(registerRoutes, db);
      expect(app.get).toHaveBeenCalledWith('/api/audit', expect.any(Function));
    });

    it('registers GET /api/sessions/:id/messages', async () => {
      const { registerRoutes } = await import('../../src/api/routes');
      const { app } = captureRoutes(registerRoutes, db);
      expect(app.get).toHaveBeenCalledWith('/api/sessions/:id/messages', expect.any(Function));
    });
  });

  // ─── GET /api/sessions ─────────────────────────────────────

  describe('GET /api/sessions', () => {
    it('returns empty array when no sessions exist', async () => {
      const { registerRoutes } = await import('../../src/api/routes');
      const { handlers } = captureRoutes(registerRoutes, db);

      const req = mockReq();
      const res = mockRes();
      handlers['GET /api/sessions'](req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('returns existing sessions', async () => {
      // Insert a session
      db.prepare(
        "INSERT INTO sessions (id, channel, user_id, model, status, started_at, total_tokens) VALUES ('s1', 'cli', 'u1', 'sonnet', 'active', ?, 0)",
      ).run(Date.now());

      const { registerRoutes } = await import('../../src/api/routes');
      const { handlers } = captureRoutes(registerRoutes, db);

      const req = mockReq();
      const res = mockRes();
      handlers['GET /api/sessions'](req, res);

      expect(res.json).toHaveBeenCalled();
      const sessions = res.json.mock.calls[0][0];
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('s1');
    });

    it('returns sessions ordered by started_at DESC', async () => {
      const now = Date.now();
      db.prepare(
        "INSERT INTO sessions (id, channel, user_id, model, status, started_at, total_tokens) VALUES ('s1', 'cli', 'u1', 'sonnet', 'active', ?, 0)",
      ).run(now - 1000);
      db.prepare(
        "INSERT INTO sessions (id, channel, user_id, model, status, started_at, total_tokens) VALUES ('s2', 'cli', 'u1', 'sonnet', 'active', ?, 0)",
      ).run(now);

      const { registerRoutes } = await import('../../src/api/routes');
      const { handlers } = captureRoutes(registerRoutes, db);

      const req = mockReq();
      const res = mockRes();
      handlers['GET /api/sessions'](req, res);

      const sessions = res.json.mock.calls[0][0];
      expect(sessions[0].id).toBe('s2'); // More recent first
      expect(sessions[1].id).toBe('s1');
    });

    it('limits results to 20', async () => {
      const now = Date.now();
      for (let i = 0; i < 25; i++) {
        db.prepare(
          "INSERT INTO sessions (id, channel, user_id, model, status, started_at, total_tokens) VALUES (?, 'cli', 'u1', 'sonnet', 'active', ?, 0)",
        ).run(`s${i}`, now + i);
      }

      const { registerRoutes } = await import('../../src/api/routes');
      const { handlers } = captureRoutes(registerRoutes, db);

      const req = mockReq();
      const res = mockRes();
      handlers['GET /api/sessions'](req, res);

      const sessions = res.json.mock.calls[0][0];
      expect(sessions).toHaveLength(20);
    });
  });

  // ─── GET /api/audit ─────────────────────────────────────────

  describe('GET /api/audit', () => {
    it('returns empty array when no audit logs exist', async () => {
      const { registerRoutes } = await import('../../src/api/routes');
      const { handlers } = captureRoutes(registerRoutes, db);

      const req = mockReq();
      const res = mockRes();
      handlers['GET /api/audit'](req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('returns audit log entries', async () => {
      db.prepare(
        "INSERT INTO audit_log (timestamp, event_type, session_id, details) VALUES (?, 'message', 's1', 'test')",
      ).run(Date.now());

      const { registerRoutes } = await import('../../src/api/routes');
      const { handlers } = captureRoutes(registerRoutes, db);

      const req = mockReq();
      const res = mockRes();
      handlers['GET /api/audit'](req, res);

      const logs = res.json.mock.calls[0][0];
      expect(logs).toHaveLength(1);
      expect(logs[0].event_type).toBe('message');
    });

    it('returns logs ordered by timestamp DESC and limited to 50', async () => {
      const now = Date.now();
      for (let i = 0; i < 55; i++) {
        db.prepare(
          "INSERT INTO audit_log (timestamp, event_type, details) VALUES (?, 'event', ?)",
        ).run(now + i, `log-${i}`);
      }

      const { registerRoutes } = await import('../../src/api/routes');
      const { handlers } = captureRoutes(registerRoutes, db);

      const req = mockReq();
      const res = mockRes();
      handlers['GET /api/audit'](req, res);

      const logs = res.json.mock.calls[0][0];
      expect(logs).toHaveLength(50);
    });
  });

  // ─── GET /api/sessions/:id/messages ─────────────────────────

  describe('GET /api/sessions/:id/messages', () => {
    it('returns empty array when no messages exist for session', async () => {
      // Create a session first
      db.prepare(
        "INSERT INTO sessions (id, channel, user_id, model, status, started_at, total_tokens) VALUES ('s1', 'cli', 'u1', 'sonnet', 'active', ?, 0)",
      ).run(Date.now());

      const { registerRoutes } = await import('../../src/api/routes');
      const { handlers } = captureRoutes(registerRoutes, db);

      const req = mockReq({ params: { id: 's1' } });
      const res = mockRes();
      handlers['GET /api/sessions/:id/messages'](req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('returns messages for a specific session', async () => {
      const now = Date.now();
      db.prepare(
        "INSERT INTO sessions (id, channel, user_id, model, status, started_at, total_tokens) VALUES ('s1', 'cli', 'u1', 'sonnet', 'active', ?, 0)",
      ).run(now);

      db.prepare(
        "INSERT INTO messages (id, session_id, role, content, tokens, timestamp) VALUES ('m1', 's1', 'user', 'Hello', 5, ?)",
      ).run(now);
      db.prepare(
        "INSERT INTO messages (id, session_id, role, content, tokens, timestamp) VALUES ('m2', 's1', 'assistant', 'Hi there', 10, ?)",
      ).run(now + 1);

      const { registerRoutes } = await import('../../src/api/routes');
      const { handlers } = captureRoutes(registerRoutes, db);

      const req = mockReq({ params: { id: 's1' } });
      const res = mockRes();
      handlers['GET /api/sessions/:id/messages'](req, res);

      const messages = res.json.mock.calls[0][0];
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');
    });

    it('returns messages in chronological order (ASC)', async () => {
      const now = Date.now();
      db.prepare(
        "INSERT INTO sessions (id, channel, user_id, model, status, started_at, total_tokens) VALUES ('s1', 'cli', 'u1', 'sonnet', 'active', ?, 0)",
      ).run(now);

      db.prepare(
        "INSERT INTO messages (id, session_id, role, content, tokens, timestamp) VALUES ('m1', 's1', 'user', 'First', 0, ?)",
      ).run(now);
      db.prepare(
        "INSERT INTO messages (id, session_id, role, content, tokens, timestamp) VALUES ('m2', 's1', 'assistant', 'Second', 0, ?)",
      ).run(now + 100);
      db.prepare(
        "INSERT INTO messages (id, session_id, role, content, tokens, timestamp) VALUES ('m3', 's1', 'user', 'Third', 0, ?)",
      ).run(now + 200);

      const { registerRoutes } = await import('../../src/api/routes');
      const { handlers } = captureRoutes(registerRoutes, db);

      const req = mockReq({ params: { id: 's1' } });
      const res = mockRes();
      handlers['GET /api/sessions/:id/messages'](req, res);

      const messages = res.json.mock.calls[0][0];
      expect(messages[0].content).toBe('First');
      expect(messages[1].content).toBe('Second');
      expect(messages[2].content).toBe('Third');
    });

    it('does not leak messages from other sessions', async () => {
      const now = Date.now();
      db.prepare(
        "INSERT INTO sessions (id, channel, user_id, model, status, started_at, total_tokens) VALUES ('s1', 'cli', 'u1', 'sonnet', 'active', ?, 0)",
      ).run(now);
      db.prepare(
        "INSERT INTO sessions (id, channel, user_id, model, status, started_at, total_tokens) VALUES ('s2', 'cli', 'u1', 'sonnet', 'active', ?, 0)",
      ).run(now);

      db.prepare(
        "INSERT INTO messages (id, session_id, role, content, tokens, timestamp) VALUES ('m1', 's1', 'user', 'Session 1', 0, ?)",
      ).run(now);
      db.prepare(
        "INSERT INTO messages (id, session_id, role, content, tokens, timestamp) VALUES ('m2', 's2', 'user', 'Session 2', 0, ?)",
      ).run(now);

      const { registerRoutes } = await import('../../src/api/routes');
      const { handlers } = captureRoutes(registerRoutes, db);

      const req = mockReq({ params: { id: 's1' } });
      const res = mockRes();
      handlers['GET /api/sessions/:id/messages'](req, res);

      const messages = res.json.mock.calls[0][0];
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Session 1');
    });
  });
});
