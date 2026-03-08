/**
 * ░▒▓ SESSION TRANSCRIPT ▓▒░ (Tier 1: Reality Logs)
 *
 * "Every message is a breadcrumb in the Matrix."
 *
 * Records every in/out message to SQLite. Source of truth for session context.
 */

import type { Message } from '@neo-agent/shared';
import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';

export class SessionTranscript {
  constructor(private db: Database.Database) {}

  record(sessionId: string, role: string, content: string, tokens?: number): void {
    this.db
      .prepare(
        `INSERT INTO messages (id, session_id, role, content, tokens, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(nanoid(), sessionId, role, content, tokens ?? this.estimateTokens(content), Date.now());
  }

  getHistory(sessionId: string, limit?: number): Message[] {
    return this.db
      .prepare(
        `SELECT * FROM messages WHERE session_id = ?
         ORDER BY timestamp ASC LIMIT ?`,
      )
      .all(sessionId, limit ?? 1000) as Message[];
  }

  getTotalTokens(sessionId: string): number {
    const result = this.db
      .prepare('SELECT COALESCE(SUM(tokens), 0) as total FROM messages WHERE session_id = ?')
      .get(sessionId) as { total: number };
    return result.total;
  }

  estimateTokens(content: string): number {
    return Math.ceil(content.length / 4); // ~4 chars/token heuristic
  }

  getMessageCount(sessionId: string): number {
    const result = this.db
      .prepare('SELECT COUNT(*) as count FROM messages WHERE session_id = ?')
      .get(sessionId) as { count: number };
    return result.count;
  }
}
