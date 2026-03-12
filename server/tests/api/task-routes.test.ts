import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryDb } from '../../src/db/connection';
import { registerTaskRoutes } from '../../src/api/task-routes';

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

function captureTaskRoutes(db: Database.Database, broadcast: (event: any) => void) {
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

  registerTaskRoutes(app as any, db, broadcast);
  return { app, handlers };
}

describe('Task API Routes', () => {
  let db: Database.Database;
  let broadcast: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    db = createMemoryDb();
    broadcast = vi.fn();
  });

  afterEach(() => {
    db.close();
  });

  // ─── Route registration ────────────────────────────────────

  describe('route registration', () => {
    it('registers all task endpoints', () => {
      const { app } = captureTaskRoutes(db, broadcast);

      expect(app.get).toHaveBeenCalledWith('/api/tasks', expect.any(Function));
      expect(app.get).toHaveBeenCalledWith('/api/tasks/:id', expect.any(Function));
      expect(app.post).toHaveBeenCalledWith('/api/tasks', expect.any(Function));
      expect(app.patch).toHaveBeenCalledWith('/api/tasks/:id', expect.any(Function));
      expect(app.patch).toHaveBeenCalledWith('/api/tasks/:id/move', expect.any(Function));
      expect(app.delete).toHaveBeenCalledWith('/api/tasks/:id', expect.any(Function));
    });
  });

  // ─── Helper to create a task via route ──────────────────────

  function createTaskViaRoute(
    handlers: Record<string, (req: any, res: any) => void>,
    body: Record<string, any>,
  ) {
    const req = mockReq({ body });
    const res = mockRes();
    handlers['POST /api/tasks'](req, res);
    return { req, res, task: res.json.mock.calls[0]?.[0] };
  }

  // ─── POST /api/tasks ───────────────────────────────────────

  describe('POST /api/tasks', () => {
    it('creates a task and returns 201', () => {
      const { handlers } = captureTaskRoutes(db, broadcast);

      const req = mockReq({ body: { title: 'New Task' } });
      const res = mockRes();
      handlers['POST /api/tasks'](req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalled();
      const task = res.json.mock.calls[0][0];
      expect(task.title).toBe('New Task');
      expect(task.id).toBeTruthy();
    });

    it('returns 400 when title is missing', () => {
      const { handlers } = captureTaskRoutes(db, broadcast);

      const req = mockReq({ body: {} });
      const res = mockRes();
      handlers['POST /api/tasks'](req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'title is required' });
    });

    it('broadcasts task:created event', () => {
      const { handlers } = captureTaskRoutes(db, broadcast);

      createTaskViaRoute(handlers, { title: 'Broadcast Test' });

      expect(broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task:created',
          task: expect.objectContaining({ title: 'Broadcast Test' }),
        }),
      );
    });

    it('accepts optional fields: description, status, priority, labels', () => {
      const { handlers } = captureTaskRoutes(db, broadcast);

      const { task } = createTaskViaRoute(handlers, {
        title: 'Full Task',
        description: 'A detailed task',
        status: 'in_progress',
        priority: 'high',
        labels: ['urgent', 'frontend'],
        createdBy: 'agent',
      });

      expect(task.title).toBe('Full Task');
      expect(task.description).toBe('A detailed task');
      expect(task.status).toBe('in_progress');
      expect(task.priority).toBe('high');
      expect(task.labels).toEqual(['urgent', 'frontend']);
      expect(task.createdBy).toBe('agent');
    });
  });

  // ─── GET /api/tasks ────────────────────────────────────────

  describe('GET /api/tasks', () => {
    it('returns empty array when no tasks exist', () => {
      const { handlers } = captureTaskRoutes(db, broadcast);

      const req = mockReq();
      const res = mockRes();
      handlers['GET /api/tasks'](req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('returns all tasks', () => {
      const { handlers } = captureTaskRoutes(db, broadcast);
      createTaskViaRoute(handlers, { title: 'Task 1' });
      createTaskViaRoute(handlers, { title: 'Task 2' });

      const req = mockReq();
      const res = mockRes();
      handlers['GET /api/tasks'](req, res);

      const tasks = res.json.mock.calls[0][0];
      expect(tasks).toHaveLength(2);
    });

    it('filters by status query parameter', () => {
      const { handlers } = captureTaskRoutes(db, broadcast);
      createTaskViaRoute(handlers, { title: 'Backlog', status: 'backlog' });
      createTaskViaRoute(handlers, { title: 'Done', status: 'done' });

      const req = mockReq({ query: { status: 'backlog' } });
      const res = mockRes();
      handlers['GET /api/tasks'](req, res);

      const tasks = res.json.mock.calls[0][0];
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Backlog');
    });

    it('filters by search query parameter', () => {
      const { handlers } = captureTaskRoutes(db, broadcast);
      createTaskViaRoute(handlers, { title: 'Fix login bug' });
      createTaskViaRoute(handlers, { title: 'Add signup' });

      const req = mockReq({ query: { search: 'login' } });
      const res = mockRes();
      handlers['GET /api/tasks'](req, res);

      const tasks = res.json.mock.calls[0][0];
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Fix login bug');
    });

    it('supports limit and offset query parameters', () => {
      const { handlers } = captureTaskRoutes(db, broadcast);
      for (let i = 0; i < 5; i++) {
        createTaskViaRoute(handlers, { title: `Task ${i}` });
      }

      const req = mockReq({ query: { limit: '2', offset: '1' } });
      const res = mockRes();
      handlers['GET /api/tasks'](req, res);

      const tasks = res.json.mock.calls[0][0];
      expect(tasks).toHaveLength(2);
    });
  });

  // ─── GET /api/tasks/:id ────────────────────────────────────

  describe('GET /api/tasks/:id', () => {
    it('returns the task by ID', () => {
      const { handlers } = captureTaskRoutes(db, broadcast);
      const { task: created } = createTaskViaRoute(handlers, { title: 'Find Me' });

      const req = mockReq({ params: { id: created.id } });
      const res = mockRes();
      handlers['GET /api/tasks/:id'](req, res);

      const task = res.json.mock.calls[0][0];
      expect(task.title).toBe('Find Me');
    });

    it('returns 404 for non-existent task', () => {
      const { handlers } = captureTaskRoutes(db, broadcast);

      const req = mockReq({ params: { id: 'nonexistent' } });
      const res = mockRes();
      handlers['GET /api/tasks/:id'](req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Task not found' });
    });
  });

  // ─── PATCH /api/tasks/:id ──────────────────────────────────

  describe('PATCH /api/tasks/:id', () => {
    it('updates task fields', () => {
      const { handlers } = captureTaskRoutes(db, broadcast);
      const { task: created } = createTaskViaRoute(handlers, { title: 'Original' });

      const req = mockReq({
        params: { id: created.id },
        body: { title: 'Updated', priority: 'critical' },
      });
      const res = mockRes();
      handlers['PATCH /api/tasks/:id'](req, res);

      const task = res.json.mock.calls[0][0];
      expect(task.title).toBe('Updated');
      expect(task.priority).toBe('critical');
    });

    it('returns 404 for non-existent task', () => {
      const { handlers } = captureTaskRoutes(db, broadcast);

      const req = mockReq({
        params: { id: 'nonexistent' },
        body: { title: 'Nope' },
      });
      const res = mockRes();
      handlers['PATCH /api/tasks/:id'](req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('broadcasts task:updated event', () => {
      const { handlers } = captureTaskRoutes(db, broadcast);
      const { task: created } = createTaskViaRoute(handlers, { title: 'Broadcast' });

      broadcast.mockClear();
      const req = mockReq({
        params: { id: created.id },
        body: { title: 'Changed' },
      });
      const res = mockRes();
      handlers['PATCH /api/tasks/:id'](req, res);

      expect(broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task:updated',
          task: expect.objectContaining({ title: 'Changed' }),
        }),
      );
    });
  });

  // ─── PATCH /api/tasks/:id/move ─────────────────────────────

  describe('PATCH /api/tasks/:id/move', () => {
    it('moves a task to a new status and position', () => {
      const { handlers } = captureTaskRoutes(db, broadcast);
      const { task: created } = createTaskViaRoute(handlers, { title: 'Move Me' });

      const req = mockReq({
        params: { id: created.id },
        body: { status: 'in_progress', position: 1 },
      });
      const res = mockRes();
      handlers['PATCH /api/tasks/:id/move'](req, res);

      const task = res.json.mock.calls[0][0];
      expect(task.status).toBe('in_progress');
      expect(task.position).toBe(1);
    });

    it('returns 400 when status is missing', () => {
      const { handlers } = captureTaskRoutes(db, broadcast);
      const { task: created } = createTaskViaRoute(handlers, { title: 'No status' });

      const req = mockReq({
        params: { id: created.id },
        body: { position: 1 },
      });
      const res = mockRes();
      handlers['PATCH /api/tasks/:id/move'](req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'status is required' });
    });

    it('returns 400 when position is missing', () => {
      const { handlers } = captureTaskRoutes(db, broadcast);
      const { task: created } = createTaskViaRoute(handlers, { title: 'No pos' });

      const req = mockReq({
        params: { id: created.id },
        body: { status: 'done' },
      });
      const res = mockRes();
      handlers['PATCH /api/tasks/:id/move'](req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'position is required' });
    });

    it('returns 404 for non-existent task', () => {
      const { handlers } = captureTaskRoutes(db, broadcast);

      const req = mockReq({
        params: { id: 'nonexistent' },
        body: { status: 'done', position: 1 },
      });
      const res = mockRes();
      handlers['PATCH /api/tasks/:id/move'](req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('broadcasts task:moved event', () => {
      const { handlers } = captureTaskRoutes(db, broadcast);
      const { task: created } = createTaskViaRoute(handlers, { title: 'Move broadcast' });

      broadcast.mockClear();
      const req = mockReq({
        params: { id: created.id },
        body: { status: 'review', position: 1 },
      });
      const res = mockRes();
      handlers['PATCH /api/tasks/:id/move'](req, res);

      expect(broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task:moved',
          task: expect.objectContaining({ status: 'review' }),
        }),
      );
    });

    it('sets completedAt when moving to done', () => {
      const { handlers } = captureTaskRoutes(db, broadcast);
      const { task: created } = createTaskViaRoute(handlers, { title: 'Complete me' });

      const req = mockReq({
        params: { id: created.id },
        body: { status: 'done', position: 1 },
      });
      const res = mockRes();
      handlers['PATCH /api/tasks/:id/move'](req, res);

      const task = res.json.mock.calls[0][0];
      expect(task.completedAt).toBeDefined();
      expect(task.completedAt).toBeGreaterThan(0);
    });
  });

  // ─── DELETE /api/tasks/:id ─────────────────────────────────

  describe('DELETE /api/tasks/:id', () => {
    it('deletes a task and returns ok', () => {
      const { handlers } = captureTaskRoutes(db, broadcast);
      const { task: created } = createTaskViaRoute(handlers, { title: 'Delete Me' });

      const req = mockReq({ params: { id: created.id } });
      const res = mockRes();
      handlers['DELETE /api/tasks/:id'](req, res);

      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    it('returns 404 for non-existent task', () => {
      const { handlers } = captureTaskRoutes(db, broadcast);

      const req = mockReq({ params: { id: 'nonexistent' } });
      const res = mockRes();
      handlers['DELETE /api/tasks/:id'](req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Task not found' });
    });

    it('broadcasts task:deleted event with ID', () => {
      const { handlers } = captureTaskRoutes(db, broadcast);
      const { task: created } = createTaskViaRoute(handlers, { title: 'Broadcast delete' });

      broadcast.mockClear();
      const req = mockReq({ params: { id: created.id } });
      const res = mockRes();
      handlers['DELETE /api/tasks/:id'](req, res);

      expect(broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task:deleted',
          id: created.id,
        }),
      );
    });

    it('task is no longer retrievable after deletion', () => {
      const { handlers } = captureTaskRoutes(db, broadcast);
      const { task: created } = createTaskViaRoute(handlers, { title: 'Gone' });

      // Delete
      const delReq = mockReq({ params: { id: created.id } });
      const delRes = mockRes();
      handlers['DELETE /api/tasks/:id'](delReq, delRes);

      // Try to get
      const getReq = mockReq({ params: { id: created.id } });
      const getRes = mockRes();
      handlers['GET /api/tasks/:id'](getReq, getRes);

      expect(getRes.status).toHaveBeenCalledWith(404);
    });
  });
});
