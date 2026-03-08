/**
 * ░▒▓ DAILY LOG ▓▒░ (Tier 3: Oracle's Journal)
 *
 * "What happened today in the Matrix?"
 *
 * Generates daily summaries of all sessions.
 * Phase 2: On-demand generation. Phase 3: cron scheduled.
 */

import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';

export interface DailyLogEntry {
  id: string;
  date: string;
  summary: string;
  decisions: string[];
  blockers: string[];
  learnings: string[];
  created_at: number;
}

export class DailyLog {
  constructor(private db: Database.Database) {}

  generateDailyLog(date?: string): DailyLogEntry | null {
    const targetDate = date ?? new Date().toISOString().split('T')[0];

    // Check if already generated
    const existing = this.getLog(targetDate);
    if (existing) return existing;

    // Get all sessions for the day
    const todaySessions = this.db
      .prepare(`SELECT * FROM sessions WHERE date(started_at/1000, 'unixepoch', 'localtime') = ?`)
      .all(targetDate) as any[];

    // Also check chat_sessions for CLI sessions
    const chatSessions = this.db
      .prepare(
        `SELECT * FROM chat_sessions WHERE date(created_at/1000, 'unixepoch', 'localtime') = ?`,
      )
      .all(targetDate) as any[];

    if (todaySessions.length === 0 && chatSessions.length === 0) return null;

    // Get messages for the day
    const messages = this.db
      .prepare(
        `SELECT m.* FROM messages m
         JOIN sessions s ON m.session_id = s.id
         WHERE date(s.started_at/1000, 'unixepoch', 'localtime') = ?
         ORDER BY m.timestamp`,
      )
      .all(targetDate) as { content: string; role: string }[];

    const decisions = this.extractByPattern(messages, /decided|chose|will use|going with/i);
    const blockers = this.extractByPattern(messages, /blocked|stuck|error|failed|broken/i);
    const learnings = this.extractByPattern(messages, /learned|realized|turns out|TIL|discovered/i);

    const summary = JSON.stringify({
      sessionsCount: todaySessions.length + chatSessions.length,
      totalMessages: messages.length,
      models: [...new Set(todaySessions.map((s: any) => s.model))],
      decisions,
      blockers,
      learnings,
    });

    const entry: DailyLogEntry = {
      id: nanoid(),
      date: targetDate,
      summary,
      decisions,
      blockers,
      learnings,
      created_at: Date.now(),
    };

    this.db
      .prepare(
        `INSERT OR IGNORE INTO daily_logs (id, date, summary, decisions, blockers, learnings, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.id,
        entry.date,
        entry.summary,
        JSON.stringify(entry.decisions),
        JSON.stringify(entry.blockers),
        JSON.stringify(entry.learnings),
        entry.created_at,
      );

    return entry;
  }

  getLog(date: string): DailyLogEntry | null {
    const row = this.db.prepare('SELECT * FROM daily_logs WHERE date = ?').get(date) as
      | any
      | undefined;

    if (!row) return null;

    return {
      id: row.id,
      date: row.date,
      summary: row.summary,
      decisions: JSON.parse(row.decisions || '[]'),
      blockers: JSON.parse(row.blockers || '[]'),
      learnings: JSON.parse(row.learnings || '[]'),
      created_at: row.created_at,
    };
  }

  getRecentLogs(limit = 7): DailyLogEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM daily_logs ORDER BY date DESC LIMIT ?')
      .all(limit) as any[];

    return rows.map((row) => ({
      id: row.id,
      date: row.date,
      summary: row.summary,
      decisions: JSON.parse(row.decisions || '[]'),
      blockers: JSON.parse(row.blockers || '[]'),
      learnings: JSON.parse(row.learnings || '[]'),
      created_at: row.created_at,
    }));
  }

  private extractByPattern(
    messages: { content: string; role: string }[],
    pattern: RegExp,
  ): string[] {
    return messages
      .filter((m) => pattern.test(m.content))
      .map((m) => m.content.slice(0, 200))
      .slice(-10);
  }
}
