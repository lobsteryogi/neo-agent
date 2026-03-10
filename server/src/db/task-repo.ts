/**
 * ░▒▓ TASK REPOSITORY ▓▒░
 *
 * "Free your mind."
 *
 * CRUD operations for Kanban tasks.
 */

import type { KanbanTask, TaskPriority, TaskStatus } from '@neo-agent/shared';
import type Database from 'better-sqlite3';
import * as crypto from 'crypto';
import { getErrorMessage } from '../utils/errors.js';

interface TaskRow {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  position: number;
  labels: string;
  session_id: string | null;
  team_id: string | null;
  created_by: string;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
}

function rowToTask(row: TaskRow): KanbanTask {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    position: row.position,
    labels: JSON.parse(row.labels),
    sessionId: row.session_id ?? undefined,
    teamId: row.team_id ?? undefined,
    createdBy: row.created_by as 'user' | 'agent',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
  };
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  labels?: string[];
  sessionId?: string;
  teamId?: string;
  createdBy?: 'user' | 'agent';
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  labels?: string[];
  sessionId?: string;
  teamId?: string;
}

export class TaskRepo {
  constructor(private db: Database.Database) {}

  list(filters?: { status?: TaskStatus; search?: string }): KanbanTask[] {
    try {
      let sql = 'SELECT * FROM tasks';
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (filters?.status) {
        conditions.push('status = ?');
        params.push(filters.status);
      }
      if (filters?.search) {
        conditions.push('(title LIKE ? OR description LIKE ?)');
        const like = `%${filters.search}%`;
        params.push(like, like);
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }
      sql += ' ORDER BY status, position ASC';

      const rows = this.db.prepare(sql).all(...params) as TaskRow[];
      return rows.map(rowToTask);
    } catch (err) {
      throw new Error(`Failed to list tasks: ${getErrorMessage(err)}`);
    }
  }

  get(id: string): KanbanTask | undefined {
    try {
      const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as
        | TaskRow
        | undefined;
      return row ? rowToTask(row) : undefined;
    } catch (err) {
      throw new Error(`Failed to get task: ${getErrorMessage(err)}`);
    }
  }

  create(input: CreateTaskInput): KanbanTask {
    try {
      const now = Date.now();
      const id = crypto.randomUUID();
      const status = input.status ?? 'backlog';

      // Get next position in column
      const maxPos = this.db
        .prepare('SELECT MAX(position) as maxPos FROM tasks WHERE status = ?')
        .get(status) as { maxPos: number | null } | undefined;
      const position = (maxPos?.maxPos ?? 0) + 1;

      this.db
        .prepare(
          `INSERT INTO tasks (id, title, description, status, priority, position, labels, session_id, team_id, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.title,
          input.description ?? '',
          status,
          input.priority ?? 'medium',
          position,
          JSON.stringify(input.labels ?? []),
          input.sessionId ?? null,
          input.teamId ?? null,
          input.createdBy ?? 'user',
          now,
          now,
        );

      const created = this.get(id);
      if (!created) throw new Error('Task was inserted but could not be retrieved');
      return created;
    } catch (err) {
      throw new Error(`Failed to create task: ${getErrorMessage(err)}`);
    }
  }

  update(id: string, fields: UpdateTaskInput): KanbanTask | undefined {
    try {
      const existing = this.get(id);
      if (!existing) return undefined;

      const sets: string[] = [];
      const params: unknown[] = [];

      if (fields.title !== undefined) {
        sets.push('title = ?');
        params.push(fields.title);
      }
      if (fields.description !== undefined) {
        sets.push('description = ?');
        params.push(fields.description);
      }
      if (fields.priority !== undefined) {
        sets.push('priority = ?');
        params.push(fields.priority);
      }
      if (fields.labels !== undefined) {
        sets.push('labels = ?');
        params.push(JSON.stringify(fields.labels));
      }
      if (fields.sessionId !== undefined) {
        sets.push('session_id = ?');
        params.push(fields.sessionId || null);
      }
      if (fields.teamId !== undefined) {
        sets.push('team_id = ?');
        params.push(fields.teamId || null);
      }

      if (sets.length === 0) return existing;

      sets.push('updated_at = ?');
      params.push(Date.now());
      params.push(id);

      this.db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...params);

      return this.get(id);
    } catch (err) {
      throw new Error(`Failed to update task: ${getErrorMessage(err)}`);
    }
  }

  move(id: string, status: TaskStatus, position: number): KanbanTask | undefined {
    try {
      const existing = this.get(id);
      if (!existing) return undefined;

      const now = Date.now();
      const completedAt = status === 'done' ? now : null;

      this.db
        .prepare(
          'UPDATE tasks SET status = ?, position = ?, updated_at = ?, completed_at = ? WHERE id = ?',
        )
        .run(status, position, now, completedAt, id);

      return this.get(id);
    } catch (err) {
      throw new Error(`Failed to move task: ${getErrorMessage(err)}`);
    }
  }

  delete(id: string): boolean {
    try {
      const result = this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
      return result.changes > 0;
    } catch (err) {
      throw new Error(`Failed to delete task: ${getErrorMessage(err)}`);
    }
  }
}
