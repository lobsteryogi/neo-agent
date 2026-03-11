/**
 * ░▒▓ SESSION MANAGER ▓▒░
 *
 * "I remember everything. It is at once a blessing and a curse."
 *
 * Resolves or creates sessions in SQLite.
 */

import type { Channel, ModelTier, Session } from '@neo-agent/shared';
import type Database from 'better-sqlite3';
import { randomBytes } from 'crypto';

export class SessionManager {
  private db: Database.Database;
  private defaultModel: ModelTier;

  constructor(db: Database.Database, defaultModel: ModelTier = 'sonnet') {
    this.db = db;
    this.defaultModel = defaultModel;
  }

  resolveOrCreate(channelId: string, userId: string, channel: Channel = 'cli'): Session {
    // Look for an active session
    const existing = this.db
      .prepare(
        'SELECT * FROM sessions WHERE channel = ? AND user_id = ? AND status = ? ORDER BY started_at DESC LIMIT 1',
      )
      .get(channel, userId, 'active') as any;

    if (existing) {
      return this.rowToSession(existing);
    }

    // Create new session
    const id = randomBytes(8).toString('hex');
    const now = Date.now();

    this.db
      .prepare(
        'INSERT INTO sessions (id, channel, user_id, model, status, started_at, total_tokens) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(id, channel, userId, this.defaultModel, 'active', now, 0);

    return {
      id,
      channel,
      userId,
      model: this.defaultModel,
      status: 'active',
      startedAt: now,
      totalTokens: 0,
      turns: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
    };
  }

  end(sessionId: string): void {
    this.db
      .prepare('UPDATE sessions SET status = ?, ended_at = ? WHERE id = ?')
      .run('ended', Date.now(), sessionId);
  }

  updateTokens(sessionId: string, tokens: number): void {
    this.db
      .prepare('UPDATE sessions SET total_tokens = total_tokens + ? WHERE id = ?')
      .run(tokens, sessionId);
  }

  updateExtendedState(
    sessionId: string,
    update: {
      sdkSessionId?: string;
      lastModelTier?: ModelTier;
      turns?: number;
      totalInputTokens?: number;
      totalOutputTokens?: number;
      totalCost?: number;
    },
  ): void {
    const sets: string[] = [];
    const values: unknown[] = [];

    if (update.sdkSessionId !== undefined) {
      sets.push('sdk_session_id = ?');
      values.push(update.sdkSessionId);
    }
    if (update.lastModelTier !== undefined) {
      sets.push('last_model_tier = ?');
      values.push(update.lastModelTier);
    }
    if (update.turns !== undefined) {
      sets.push('turns = ?');
      values.push(update.turns);
    }
    if (update.totalInputTokens !== undefined) {
      sets.push('total_input_tokens = ?');
      values.push(update.totalInputTokens);
    }
    if (update.totalOutputTokens !== undefined) {
      sets.push('total_output_tokens = ?');
      values.push(update.totalOutputTokens);
    }
    if (update.totalCost !== undefined) {
      sets.push('total_cost = ?');
      values.push(update.totalCost);
    }

    if (sets.length === 0) return;
    values.push(sessionId);
    this.db.prepare(`UPDATE sessions SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }

  private rowToSession(row: any): Session {
    return {
      id: row.id,
      channel: row.channel,
      userId: row.user_id,
      model: row.model,
      status: row.status,
      startedAt: row.started_at,
      endedAt: row.ended_at ?? undefined,
      totalTokens: row.total_tokens,
      sdkSessionId: row.sdk_session_id ?? undefined,
      lastModelTier: row.last_model_tier ?? undefined,
      turns: row.turns ?? 0,
      totalInputTokens: row.total_input_tokens ?? 0,
      totalOutputTokens: row.total_output_tokens ?? 0,
      totalCost: row.total_cost ?? 0,
    };
  }
}
