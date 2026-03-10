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
import { getErrorMessage } from '../utils/errors.js';

export function registerTaskRoutes(
  app: Express,
  db: Database.Database,
  broadcast: (event: { type: string; [key: string]: unknown }) => void,
): void {
  const repo = new TaskRepo(db);

  // List tasks
  app.get('/api/tasks', (req, res) => {
    try {
      const status = req.query.status as TaskStatus | undefined;
      const search = req.query.search as string | undefined;
      const tasks = repo.list({ status, search });
      res.json(tasks);
    } catch (err) {
      res.status(500).json({ error: getErrorMessage(err) });
    }
  });

  // Get single task
  app.get('/api/tasks/:id', (req, res) => {
    try {
      const task = repo.get(req.params.id);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      res.json(task);
    } catch (err) {
      res.status(500).json({ error: getErrorMessage(err) });
    }
  });

  // Create task
  app.post('/api/tasks', (req, res) => {
    try {
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
    } catch (err) {
      res.status(500).json({ error: getErrorMessage(err) });
    }
  });

  // Update task fields
  app.patch('/api/tasks/:id', (req, res) => {
    try {
      const { title, description, priority, labels, sessionId, teamId } = req.body;
      const task = repo.update(req.params.id, {
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
    } catch (err) {
      res.status(500).json({ error: getErrorMessage(err) });
    }
  });

  // Move task to new column + position
  app.patch('/api/tasks/:id/move', (req, res) => {
    try {
      const { status, position } = req.body;
      if (!status) return res.status(400).json({ error: 'status is required' });
      if (position === undefined) return res.status(400).json({ error: 'position is required' });

      const task = repo.move(req.params.id, status, position);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      broadcast({ type: 'task:moved', task });
      res.json(task);
    } catch (err) {
      res.status(500).json({ error: getErrorMessage(err) });
    }
  });

  // Delete task
  app.delete('/api/tasks/:id', (req, res) => {
    try {
      const deleted = repo.delete(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Task not found' });
      broadcast({ type: 'task:deleted', id: req.params.id });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: getErrorMessage(err) });
    }
  });
}
