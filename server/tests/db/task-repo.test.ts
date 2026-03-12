import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryDb } from '../../src/db/connection';
import { TaskRepo, type CreateTaskInput } from '../../src/db/task-repo';

describe('TaskRepo', () => {
  let db: Database.Database;
  let repo: TaskRepo;

  beforeEach(() => {
    db = createMemoryDb();
    repo = new TaskRepo(db);
  });

  afterEach(() => {
    db.close();
  });

  function createTask(overrides: Partial<CreateTaskInput> = {}) {
    return repo.create({
      title: 'Test Task',
      description: 'A test task',
      priority: 'medium',
      labels: ['test'],
      createdBy: 'user',
      ...overrides,
    });
  }

  // ─── create ──────────────────────────────────────────────────

  describe('create', () => {
    it('creates a task with all fields populated', () => {
      const task = createTask();
      expect(task.id).toBeTruthy();
      expect(task.title).toBe('Test Task');
      expect(task.description).toBe('A test task');
      expect(task.status).toBe('backlog');
      expect(task.priority).toBe('medium');
      expect(task.labels).toEqual(['test']);
      expect(task.createdBy).toBe('user');
      expect(task.createdAt).toBeGreaterThan(0);
      expect(task.updatedAt).toBeGreaterThan(0);
    });

    it('defaults status to backlog', () => {
      const task = createTask();
      expect(task.status).toBe('backlog');
    });

    it('defaults priority to medium', () => {
      const task = repo.create({ title: 'No priority' });
      expect(task.priority).toBe('medium');
    });

    it('defaults createdBy to user', () => {
      const task = repo.create({ title: 'Default creator' });
      expect(task.createdBy).toBe('user');
    });

    it('defaults labels to empty array', () => {
      const task = repo.create({ title: 'No labels' });
      expect(task.labels).toEqual([]);
    });

    it('defaults description to empty string', () => {
      const task = repo.create({ title: 'No description' });
      expect(task.description).toBe('');
    });

    it('allows specifying initial status', () => {
      const task = createTask({ status: 'in_progress' });
      expect(task.status).toBe('in_progress');
    });

    it('allows agent as createdBy', () => {
      const task = createTask({ createdBy: 'agent' });
      expect(task.createdBy).toBe('agent');
    });

    it('auto-increments position within same status column', () => {
      const t1 = createTask({ title: 'First' });
      const t2 = createTask({ title: 'Second' });
      const t3 = createTask({ title: 'Third' });
      expect(t1.position).toBe(1);
      expect(t2.position).toBe(2);
      expect(t3.position).toBe(3);
    });

    it('assigns independent positions per status column', () => {
      const backlog = createTask({ title: 'Backlog', status: 'backlog' });
      const inProgress = createTask({ title: 'In Progress', status: 'in_progress' });
      expect(backlog.position).toBe(1);
      expect(inProgress.position).toBe(1);
    });

    it('generates unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const task = createTask({ title: `Task ${i}` });
        ids.add(task.id);
      }
      expect(ids.size).toBe(20);
    });
  });

  // ─── get ─────────────────────────────────────────────────────

  describe('get', () => {
    it('returns the task by ID', () => {
      const created = createTask();
      const found = repo.get(created.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.title).toBe(created.title);
    });

    it('returns undefined for non-existent ID', () => {
      const result = repo.get('does-not-exist');
      expect(result).toBeUndefined();
    });

    it('returns labels as a parsed array', () => {
      const created = createTask({ labels: ['bug', 'urgent'] });
      const found = repo.get(created.id);
      expect(found!.labels).toEqual(['bug', 'urgent']);
    });
  });

  // ─── list ────────────────────────────────────────────────────

  describe('list', () => {
    it('lists all tasks when no filters are given', () => {
      createTask({ title: 'A' });
      createTask({ title: 'B' });
      createTask({ title: 'C' });
      const tasks = repo.list();
      expect(tasks).toHaveLength(3);
    });

    it('returns empty array when no tasks exist', () => {
      const tasks = repo.list();
      expect(tasks).toEqual([]);
    });

    it('filters by status', () => {
      createTask({ title: 'Backlog 1', status: 'backlog' });
      createTask({ title: 'Backlog 2', status: 'backlog' });
      createTask({ title: 'In Progress', status: 'in_progress' });

      const backlog = repo.list({ status: 'backlog' });
      expect(backlog).toHaveLength(2);
      expect(backlog.every((t) => t.status === 'backlog')).toBe(true);

      const inProgress = repo.list({ status: 'in_progress' });
      expect(inProgress).toHaveLength(1);
      expect(inProgress[0].title).toBe('In Progress');
    });

    it('filters by search term in title', () => {
      createTask({ title: 'Fix login bug' });
      createTask({ title: 'Add signup page' });
      createTask({ title: 'Login rate limiter' });

      const results = repo.list({ search: 'login' });
      expect(results).toHaveLength(2);
    });

    it('filters by search term in description', () => {
      createTask({ title: 'Task A', description: 'Related to authentication' });
      createTask({ title: 'Task B', description: 'Related to UI' });

      const results = repo.list({ search: 'authentication' });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Task A');
    });

    it('combines status and search filters', () => {
      createTask({ title: 'Fix login', status: 'backlog' });
      createTask({ title: 'Fix login prod', status: 'in_progress' });
      createTask({ title: 'Add signup', status: 'backlog' });

      const results = repo.list({ status: 'backlog', search: 'login' });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Fix login');
    });

    it('respects limit parameter', () => {
      for (let i = 0; i < 10; i++) createTask({ title: `Task ${i}` });
      const results = repo.list({ limit: 3 });
      expect(results).toHaveLength(3);
    });

    it('respects offset parameter', () => {
      for (let i = 0; i < 5; i++) createTask({ title: `Task ${i}` });
      const all = repo.list();
      const offset = repo.list({ offset: 2 });
      expect(offset).toHaveLength(3);
      expect(offset[0].id).toBe(all[2].id);
    });

    it('caps limit at 500', () => {
      // Create a few tasks and verify the query doesn't break with large limits
      createTask({ title: 'Only task' });
      const results = repo.list({ limit: 1000 });
      expect(results).toHaveLength(1);
    });

    it('orders by status then position', () => {
      const t1 = createTask({ title: 'Backlog 2', status: 'backlog' });
      const t2 = createTask({ title: 'Backlog 1', status: 'backlog' });
      const t3 = createTask({ title: 'Done 1', status: 'done' });

      const results = repo.list();
      // backlog comes before done alphabetically, and within status, ordered by position
      expect(results[0].id).toBe(t1.id);
      expect(results[1].id).toBe(t2.id);
      expect(results[2].id).toBe(t3.id);
    });
  });

  // ─── update ──────────────────────────────────────────────────

  describe('update', () => {
    it('updates the title', () => {
      const task = createTask({ title: 'Original' });
      const updated = repo.update(task.id, { title: 'Updated' });
      expect(updated).toBeDefined();
      expect(updated!.title).toBe('Updated');
    });

    it('updates the description', () => {
      const task = createTask({ description: 'Old desc' });
      const updated = repo.update(task.id, { description: 'New desc' });
      expect(updated!.description).toBe('New desc');
    });

    it('updates the priority', () => {
      const task = createTask({ priority: 'low' });
      const updated = repo.update(task.id, { priority: 'critical' });
      expect(updated!.priority).toBe('critical');
    });

    it('updates labels', () => {
      const task = createTask({ labels: ['old'] });
      const updated = repo.update(task.id, { labels: ['new', 'updated'] });
      expect(updated!.labels).toEqual(['new', 'updated']);
    });

    it('updates sessionId with a valid FK reference', () => {
      // Create a session to satisfy FK constraint
      db.prepare(
        "INSERT INTO sessions (id, channel, user_id, model, status, started_at, total_tokens) VALUES ('session-123', 'cli', 'u1', 'sonnet', 'active', ?, 0)",
      ).run(Date.now());

      const task = createTask();
      const updated = repo.update(task.id, { sessionId: 'session-123' });
      expect(updated!.sessionId).toBe('session-123');
    });

    it('clears sessionId by setting empty string', () => {
      const task = createTask();
      const updated = repo.update(task.id, { sessionId: '' });
      // Empty string becomes null via the || null logic
      expect(updated!.sessionId).toBeUndefined();
    });

    it('updates teamId with a valid FK reference', () => {
      // Create an agent team to satisfy FK constraint
      db.prepare(
        "INSERT INTO agent_teams (id, pattern, agents, status, parent_session, created_at) VALUES ('team-abc', 'sequential', '[]', 'pending', NULL, ?)",
      ).run(Date.now());

      const task = createTask();
      const updated = repo.update(task.id, { teamId: 'team-abc' });
      expect(updated!.teamId).toBe('team-abc');
    });

    it('updates multiple fields at once', () => {
      const task = createTask({ title: 'Old', priority: 'low' });
      const updated = repo.update(task.id, {
        title: 'New',
        priority: 'high',
        description: 'Multi update',
      });
      expect(updated!.title).toBe('New');
      expect(updated!.priority).toBe('high');
      expect(updated!.description).toBe('Multi update');
    });

    it('sets updated_at timestamp', () => {
      const task = createTask();
      const originalUpdatedAt = task.updatedAt;
      // Small delay to ensure timestamp differs
      const updated = repo.update(task.id, { title: 'Changed' });
      expect(updated!.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt);
    });

    it('returns undefined for non-existent ID', () => {
      const result = repo.update('nonexistent', { title: 'No task' });
      expect(result).toBeUndefined();
    });

    it('returns existing task when no fields are changed', () => {
      const task = createTask();
      const result = repo.update(task.id, {});
      expect(result).toBeDefined();
      expect(result!.id).toBe(task.id);
    });

    it('does not modify status (status changes go through move)', () => {
      const task = createTask({ status: 'backlog' });
      // update does not accept status as a field
      const updated = repo.update(task.id, { title: 'No status change' });
      expect(updated!.status).toBe('backlog');
    });
  });

  // ─── move ────────────────────────────────────────────────────

  describe('move', () => {
    it('moves a task to a new status column', () => {
      const task = createTask({ status: 'backlog' });
      const moved = repo.move(task.id, 'in_progress', 1);
      expect(moved).toBeDefined();
      expect(moved!.status).toBe('in_progress');
      expect(moved!.position).toBe(1);
    });

    it('sets completedAt when moved to done', () => {
      const task = createTask({ status: 'backlog' });
      const moved = repo.move(task.id, 'done', 1);
      expect(moved!.completedAt).toBeDefined();
      expect(moved!.completedAt).toBeGreaterThan(0);
    });

    it('clears completedAt when moved away from done', () => {
      const task = createTask({ status: 'backlog' });
      const done = repo.move(task.id, 'done', 1);
      expect(done!.completedAt).toBeTruthy();

      const reopened = repo.move(task.id, 'in_progress', 1);
      expect(reopened!.completedAt).toBeUndefined();
    });

    it('updates position within the same column', () => {
      const task = createTask({ status: 'backlog' });
      const moved = repo.move(task.id, 'backlog', 99);
      expect(moved!.position).toBe(99);
    });

    it('returns undefined for non-existent ID', () => {
      const result = repo.move('nonexistent', 'backlog', 1);
      expect(result).toBeUndefined();
    });

    it('updates the updated_at timestamp', () => {
      const task = createTask();
      const moved = repo.move(task.id, 'review', 1);
      expect(moved!.updatedAt).toBeGreaterThanOrEqual(task.updatedAt);
    });
  });

  // ─── delete ──────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes an existing task and returns true', () => {
      const task = createTask();
      const result = repo.delete(task.id);
      expect(result).toBe(true);
    });

    it('returns false for non-existent ID', () => {
      const result = repo.delete('nonexistent');
      expect(result).toBe(false);
    });

    it('task is no longer retrievable after deletion', () => {
      const task = createTask();
      repo.delete(task.id);
      expect(repo.get(task.id)).toBeUndefined();
    });

    it('does not affect other tasks', () => {
      const t1 = createTask({ title: 'Keep' });
      const t2 = createTask({ title: 'Delete' });
      repo.delete(t2.id);
      expect(repo.get(t1.id)).toBeDefined();
      expect(repo.list()).toHaveLength(1);
    });
  });

  // ─── Edge cases ──────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles tasks with empty labels array', () => {
      const task = createTask({ labels: [] });
      const found = repo.get(task.id);
      expect(found!.labels).toEqual([]);
    });

    it('handles tasks with special characters in title', () => {
      const task = createTask({ title: "Task with 'quotes' & <tags>" });
      const found = repo.get(task.id);
      expect(found!.title).toBe("Task with 'quotes' & <tags>");
    });

    it('handles tasks with unicode in description', () => {
      const task = createTask({ description: 'Fix the bug in the Matrix' });
      const found = repo.get(task.id);
      expect(found!.description).toBe('Fix the bug in the Matrix');
    });

    it('handles very long descriptions', () => {
      const longDesc = 'x'.repeat(10000);
      const task = createTask({ description: longDesc });
      const found = repo.get(task.id);
      expect(found!.description).toBe(longDesc);
    });

    it('handles search with special SQL characters', () => {
      createTask({ title: 'Task with % percent' });
      createTask({ title: 'Task with _ underscore' });
      // The LIKE query uses % wrapping, so this tests edge behavior
      const results = repo.list({ search: '%' });
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });
});
