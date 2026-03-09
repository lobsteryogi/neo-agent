/**
 * ░▒▓ SIBLING AWARENESS ▓▒░
 *
 * "Millions of them."
 *
 * File-level locking for parallel sessions running on the same workspace.
 * Uses SQLite sibling_locks table (created in migration v1) for persistence.
 */

import type { SiblingStatus } from '@neo-agent/shared';
import type Database from 'better-sqlite3';

interface SessionInfo {
  sessionId: string;
  task?: string;
  startedAt: number;
}

export class SiblingAwareness {
  private activeSessions = new Map<string, SessionInfo>();

  constructor(private db: Database.Database) {}

  register(sessionId: string, task?: string) {
    this.activeSessions.set(sessionId, {
      sessionId,
      task,
      startedAt: Date.now(),
    });
  }

  unregister(sessionId: string) {
    this.activeSessions.delete(sessionId);
    // Release all locks held by this session
    this.db.prepare('DELETE FROM sibling_locks WHERE session_id = ?').run(sessionId);
  }

  /**
   * Attempt to acquire a file lock for a session.
   * Returns true if the lock was acquired, false if another session holds it.
   */
  acquireFileLock(sessionId: string, path: string): boolean {
    const existing = this.db
      .prepare('SELECT session_id FROM sibling_locks WHERE file_path = ?')
      .get(path) as { session_id: string } | undefined;

    // Already held by the same session — re-entrant
    if (existing?.session_id === sessionId) return true;

    // Held by another active session — blocked
    if (existing && this.activeSessions.has(existing.session_id)) return false;

    // If held by a dead session, clean it up first
    if (existing) {
      this.db.prepare('DELETE FROM sibling_locks WHERE file_path = ?').run(path);
    }

    this.db
      .prepare('INSERT INTO sibling_locks (file_path, session_id, locked_at) VALUES (?, ?, ?)')
      .run(path, sessionId, Date.now());

    return true;
  }

  releaseFileLock(sessionId: string, path: string) {
    this.db
      .prepare('DELETE FROM sibling_locks WHERE file_path = ? AND session_id = ?')
      .run(path, sessionId);
  }

  getStatus(): SiblingStatus[] {
    return Array.from(this.activeSessions.values()).map((info) => {
      const locks = this.db
        .prepare('SELECT file_path FROM sibling_locks WHERE session_id = ?')
        .all(info.sessionId) as { file_path: string }[];

      return {
        sessionId: info.sessionId,
        task: info.task,
        lockedFiles: locks.map((l) => l.file_path),
        startedAt: info.startedAt,
      };
    });
  }

  get activeCount(): number {
    return this.activeSessions.size;
  }
}
