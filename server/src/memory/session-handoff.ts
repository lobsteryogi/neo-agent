/**
 * ░▒▓ SESSION HANDOFF ▓▒░ (Tier 2: Red Pill Moments)
 *
 * "I can feel you now. You're afraid... of change."
 *
 * Captures context snapshots before The Fade (compaction).
 * Triggered when token usage approaches the model's context limit.
 */

import type { FadeCheck, HandoffSnapshot, ModelTier } from '@neo-agent/shared';
import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import { SessionTranscript } from './session-transcript.js';

interface HandoffConfig {
  fadeThreshold: number; // 0-1, default 0.85
}

const MODEL_LIMITS: Record<string, number> = {
  haiku: 200_000,
  sonnet: 200_000,
  opus: 200_000,
};

export class SessionHandoff {
  private transcript: SessionTranscript;
  private fadeThreshold: number;

  constructor(
    private db: Database.Database,
    config: HandoffConfig,
  ) {
    this.transcript = new SessionTranscript(db);
    this.fadeThreshold = config.fadeThreshold;
  }

  checkForFade(
    session: { id: string; model: ModelTier | string },
    currentTokens?: number,
  ): FadeCheck {
    const tokens = currentTokens ?? this.transcript.getTotalTokens(session.id);
    const limit = MODEL_LIMITS[session.model] ?? 200_000;
    const ratio = tokens / limit;

    if (ratio < this.fadeThreshold) {
      return { fading: false, ratio };
    }

    // Capture Red Pill Moment
    const snapshot = this.captureSnapshot(session);
    this.db
      .prepare(
        `INSERT INTO handoffs (id, session_id, snapshot, context_size, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(nanoid(), session.id, JSON.stringify(snapshot), tokens, Date.now());

    return { fading: true, ratio, snapshotId: snapshot.id };
  }

  getLatestHandoff(sessionId: string): HandoffSnapshot | null {
    const row = this.db
      .prepare(
        `SELECT snapshot FROM handoffs WHERE session_id = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(sessionId) as { snapshot: string } | undefined;

    return row ? JSON.parse(row.snapshot) : null;
  }

  getRecentHandoffs(limit = 3): HandoffSnapshot[] {
    const rows = this.db
      .prepare('SELECT snapshot FROM handoffs ORDER BY created_at DESC LIMIT ?')
      .all(limit) as { snapshot: string }[];

    return rows.map((r) => JSON.parse(r.snapshot));
  }

  private captureSnapshot(session: { id: string }): HandoffSnapshot {
    const messages = this.transcript.getHistory(session.id);
    const recentMessages = messages.slice(-50);

    return {
      id: nanoid(),
      decisions: this.extractByPattern(
        recentMessages,
        /decided|chose|went with|will use|going with/i,
      ),
      keyFacts: this.extractByPattern(recentMessages, /important|note|remember|key fact|fyi/i),
      openQuestions: this.extractByPattern(
        recentMessages,
        /\?$|todo|still need|unresolved|pending/i,
      ),
      workInProgress: this.extractByPattern(
        recentMessages,
        /working on|in progress|started|building/i,
      ),
      userPreferences: this.extractByPattern(
        recentMessages,
        /prefer|always|never|like to|don't like/i,
      ),
      timestamp: Date.now(),
    };
  }

  private extractByPattern(
    messages: { content: string; role: string }[],
    pattern: RegExp,
  ): string[] {
    return messages
      .filter((m) => m.role === 'user' && pattern.test(m.content))
      .map((m) => m.content.slice(0, 200)) // truncate long messages
      .slice(-10); // keep only recent matches
  }
}
