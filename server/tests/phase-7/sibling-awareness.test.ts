import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../../src/db/migrations';
import { SiblingAwareness } from '../../src/sessions/sibling-awareness';

describe('SiblingAwareness (The Smiths)', () => {
  let db: Database.Database;
  let siblings: SiblingAwareness;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    siblings = new SiblingAwareness(db);
  });

  afterEach(() => {
    db.close();
  });

  it('acquires file lock for a session', () => {
    siblings.register('session-1', 'writing code');
    expect(siblings.acquireFileLock('session-1', '/src/app.ts')).toBe(true);
  });

  it('blocks file lock if held by another session', () => {
    siblings.register('session-1', 'writing');
    siblings.register('session-2', 'also writing');
    siblings.acquireFileLock('session-1', '/src/app.ts');
    expect(siblings.acquireFileLock('session-2', '/src/app.ts')).toBe(false);
  });

  it('allows same session to re-acquire its own lock', () => {
    siblings.register('session-1', 'writing');
    siblings.acquireFileLock('session-1', '/src/app.ts');
    expect(siblings.acquireFileLock('session-1', '/src/app.ts')).toBe(true);
  });

  it('releases lock and allows another session to take it', () => {
    siblings.register('session-1', 'writing');
    siblings.register('session-2', 'waiting');
    siblings.acquireFileLock('session-1', '/src/app.ts');
    siblings.releaseFileLock('session-1', '/src/app.ts');
    expect(siblings.acquireFileLock('session-2', '/src/app.ts')).toBe(true);
  });

  it('getStatus() returns all active sessions with locked files', () => {
    siblings.register('session-1', 'coding');
    siblings.acquireFileLock('session-1', '/src/a.ts');
    siblings.acquireFileLock('session-1', '/src/b.ts');

    const statuses = siblings.getStatus();
    expect(statuses).toHaveLength(1);
    expect(statuses[0].sessionId).toBe('session-1');
    expect(statuses[0].task).toBe('coding');
    expect(statuses[0].lockedFiles).toHaveLength(2);
  });

  it('unregister cleans up session and all its locks', () => {
    siblings.register('session-1', 'work');
    siblings.register('session-2', 'other work');
    siblings.acquireFileLock('session-1', '/src/a.ts');
    siblings.acquireFileLock('session-1', '/src/b.ts');

    siblings.unregister('session-1');

    expect(siblings.activeCount).toBe(1);
    // session-2 can now acquire the previously locked files
    expect(siblings.acquireFileLock('session-2', '/src/a.ts')).toBe(true);
  });
});
