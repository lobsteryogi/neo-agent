/**
 * ░▒▓ TASK ROUTES ▓▒░
 *
 * "What is real? How do you define real?"
 *
 * REST endpoints for Kanban task management.
 */

import type { TaskStatus } from '@neo-agent/shared';
import type Database from 'better-sqlite3';
import type { Express } from 'express';
import { TaskRepo } from '../db/task-repo.js';
import { wrapRoute } from './route-handler.js';

export function registerTaskRoutes(
  app: Express,
  db: Database.Database,
  broadcast: (event: { type: string; [key: string]: unknown }) => void,
): void {
  const repo = new TaskRepo(db);

  // List tasks (with pagination)
  app.get(
    '/api/tasks',
    wrapRoute((req, res) => {
      const status = req.query.status as TaskStatus | undefined;
      const search = req.query.search as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
      const tasks = repo.list({ status, search, limit, offset });
      res.json(tasks);
    }),
  );

  // Get single task
  app.get(
    '/api/tasks/:id',
    wrapRoute((req, res) => {
      const task = repo.get(req.params.id as string);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      res.json(task);
    }),
  );

  // Create task
  app.post(
    '/api/tasks',
    wrapRoute((req, res) => {
      const { title, description, status, priority, labels, sessionId, teamId, createdBy } =
        req.body;
      if (!title) return res.status(400).json({ error: 'title is required' });

      const task = repo.create({
        title,
        description,
        status,
        priority,
        labels,
        sessionId,
        teamId,
        createdBy,
      });
      broadcast({ type: 'task:created', task });
      res.status(201).json(task);
    }),
  );

  // Update task fields
  app.patch(
    '/api/tasks/:id',
    wrapRoute((req, res) => {
      const { title, description, priority, labels, sessionId, teamId } = req.body;
      const task = repo.update(req.params.id as string, {
        title,
        description,
        priority,
        labels,
        sessionId,
        teamId,
      });
      if (!task) return res.status(404).json({ error: 'Task not found' });
      broadcast({ type: 'task:updated', task });
      res.json(task);
    }),
  );

  // Move task to new column + position
  app.patch(
    '/api/tasks/:id/move',
    wrapRoute((req, res) => {
      const { status, position } = req.body;
      if (!status) return res.status(400).json({ error: 'status is required' });
      if (position === undefined) return res.status(400).json({ error: 'position is required' });

      const id = req.params.id as string;
      const task = repo.move(id, status, position);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      broadcast({ type: 'task:moved', task });
      res.json(task);
    }),
  );

  // Delete task
  app.delete(
    '/api/tasks/:id',
    wrapRoute((req, res) => {
      const id = req.params.id as string;
      const deleted = repo.delete(id);
      if (!deleted) return res.status(404).json({ error: 'Task not found' });
      broadcast({ type: 'task:deleted', id });
      res.json({ ok: true });
    }),
  );
}
