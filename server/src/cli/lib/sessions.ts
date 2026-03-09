/**
 * ░▒▓ SESSION MANAGER ▓▒░
 *
 * "It is the world that has been pulled over your eyes."
 *
 * Manages chat session state with SQLite persistence.
 */

import type { ModelTier } from '@neo-agent/shared';
import type Database from 'better-sqlite3';
import { randomBytes } from 'crypto';

// ─── Types ────────────────────────────────────────────────────

export interface SessionState {
  id: string;
  sdkSessionId?: string;
  turns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  startedAt: number;
  lastModelTier?: ModelTier;
}

// ─── Manager ──────────────────────────────────────────────────

export class SessionManager {
  private sessions = new Map<string, SessionState>();
  current: SessionState;

  constructor(private db: Database.Database) {
    this.loadAll();
    this.current = this.sessions.get('default') ?? this.create('default');
  }

  get(id: string): SessionState | undefined {
    return this.sessions.get(id);
  }

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  all(): Map<string, SessionState> {
    return this.sessions;
  }

  switchTo(id: string): SessionState {
    const session = this.sessions.get(id);
    if (session) {
      this.current = session;
      return session;
    }
    return this.create(id);
  }

  create(name?: string): SessionState {
    const id = name ?? randomBytes(4).toString('hex');
    const session: SessionState = {
      id,
      turns: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      startedAt: Date.now(),
    };
    this.sessions.set(id, session);
    this.save(session);

    // Ensure a row in `sessions` table so the FK on `messages` is satisfied
    this.db
      .prepare(
        `INSERT OR IGNORE INTO sessions (id, channel, user_id, model, status, started_at, total_tokens)
       VALUES (?, 'cli', ?, 'sonnet', 'active', ?, 0)`,
      )
      .run(id, process.env.NEO_USER_NAME ?? 'user', session.startedAt);

    this.current = session;
    return session;
  }

  save(s: SessionState): void {
    this.db
      .prepare(
        `
      INSERT INTO chat_sessions (id, sdk_session_id, turns, total_input_tokens, total_output_tokens, total_cost, last_model, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        sdk_session_id = excluded.sdk_session_id,
        turns = excluded.turns,
        total_input_tokens = excluded.total_input_tokens,
        total_output_tokens = excluded.total_output_tokens,
        total_cost = excluded.total_cost,
        updated_at = excluded.updated_at
    `,
      )
      .run(
        s.id,
        s.sdkSessionId ?? null,
        s.turns,
        s.totalInputTokens,
        s.totalOutputTokens,
        s.totalCost,
        null,
        s.startedAt,
        Date.now(),
      );
  }

  // ── Private ──────────────────────────────────────────────────

  private loadAll(): void {
    const rows = this.db
      .prepare('SELECT * FROM chat_sessions ORDER BY updated_at DESC')
      .all() as any[];
    for (const row of rows) {
      this.sessions.set(row.id, {
        id: row.id,
        sdkSessionId: row.sdk_session_id ?? undefined,
        turns: row.turns,
        totalInputTokens: row.total_input_tokens,
        totalOutputTokens: row.total_output_tokens,
        totalCost: row.total_cost,
        startedAt: row.created_at,
      });
    }

    // Ensure all loaded sessions have a matching `sessions` row for FK constraints
    for (const [id, s] of this.sessions) {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO sessions (id, channel, user_id, model, status, started_at, total_tokens)
         VALUES (?, 'cli', ?, 'sonnet', 'active', ?, 0)`,
        )
        .run(id, process.env.NEO_USER_NAME ?? 'user', s.startedAt);
    }
  }
}
