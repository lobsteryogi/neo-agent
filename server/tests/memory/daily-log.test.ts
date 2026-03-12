import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryDb } from '../../src/db/connection';
import { DailyLog } from '../../src/memory/daily-log';

describe("DailyLog (Oracle's Journal)", () => {
  let db: Database.Database;
  let dailyLog: DailyLog;

  beforeEach(() => {
    db = createMemoryDb();
    dailyLog = new DailyLog(db);
  });

  // Helper to insert a session with a specific date
  function insertSession(id: string, date: string, model = 'sonnet') {
    const timestamp = new Date(date + 'T12:00:00').getTime();
    db.prepare(
      'INSERT INTO sessions (id, channel, model, status, started_at, total_tokens) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, 'cli', model, 'active', timestamp, 0);
  }

  // Helper to insert a message for a session
  function insertMessage(sessionId: string, role: string, content: string) {
    const id = Math.random().toString(36).slice(2);
    db.prepare(
      'INSERT INTO messages (id, session_id, role, content, tokens, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, sessionId, role, content, 10, Date.now());
  }

  // Helper to insert a chat_session with a specific date
  function insertChatSession(id: string, date: string) {
    const timestamp = new Date(date + 'T12:00:00').getTime();
    db.prepare(
      'INSERT INTO chat_sessions (id, turns, total_input_tokens, total_output_tokens, total_cost, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, 0, 0, 0, 0, timestamp, timestamp);
  }

  // ─── generateDailyLog() ─────────────────────────────────────

  it('returns null when no sessions exist for the date', () => {
    const result = dailyLog.generateDailyLog('2025-01-01');
    expect(result).toBeNull();
  });

  it('generates a log entry for a date with sessions', () => {
    insertSession('s1', '2025-06-15');
    insertMessage('s1', 'user', 'Hello there');
    insertMessage('s1', 'assistant', 'Hi, how can I help?');

    const entry = dailyLog.generateDailyLog('2025-06-15');
    expect(entry).not.toBeNull();
    expect(entry!.date).toBe('2025-06-15');
    expect(entry!.id).toBeDefined();
    expect(entry!.summary).toBeDefined();
    expect(entry!.created_at).toBeGreaterThan(0);
  });

  it('returns existing log if already generated for a date', () => {
    insertSession('s1', '2025-06-15');
    insertMessage('s1', 'user', 'First call');

    const first = dailyLog.generateDailyLog('2025-06-15');
    const second = dailyLog.generateDailyLog('2025-06-15');

    expect(first!.id).toBe(second!.id);
  });

  it('extracts decisions from messages matching decision patterns', () => {
    insertSession('s1', '2025-06-15');
    insertMessage('s1', 'user', 'I decided to use TypeScript');
    insertMessage('s1', 'assistant', 'Good choice, going with TypeScript');

    const entry = dailyLog.generateDailyLog('2025-06-15');
    expect(entry!.decisions.length).toBeGreaterThan(0);
    expect(entry!.decisions.some((d) => d.includes('decided') || d.includes('going with'))).toBe(
      true,
    );
  });

  it('extracts blockers from messages matching blocker patterns', () => {
    insertSession('s1', '2025-06-15');
    insertMessage('s1', 'user', 'I am blocked by a failing CI pipeline');
    insertMessage('s1', 'assistant', 'The error seems to be in the config');

    const entry = dailyLog.generateDailyLog('2025-06-15');
    expect(entry!.blockers.length).toBeGreaterThan(0);
  });

  it('extracts learnings from messages matching learning patterns', () => {
    insertSession('s1', '2025-06-15');
    insertMessage('s1', 'user', 'TIL you can use ?? in TypeScript');
    insertMessage('s1', 'assistant', 'I learned that null coalescing is powerful');

    const entry = dailyLog.generateDailyLog('2025-06-15');
    expect(entry!.learnings.length).toBeGreaterThan(0);
  });

  it('truncates message content to 200 chars in extractions', () => {
    insertSession('s1', '2025-06-15');
    const longContent = 'I decided ' + 'A'.repeat(300);
    insertMessage('s1', 'user', longContent);

    const entry = dailyLog.generateDailyLog('2025-06-15');
    expect(entry!.decisions[0].length).toBeLessThanOrEqual(200);
  });

  it('limits extracted items to 10 per category', () => {
    insertSession('s1', '2025-06-15');
    for (let i = 0; i < 15; i++) {
      insertMessage('s1', 'user', `I decided to do thing ${i}`);
    }

    const entry = dailyLog.generateDailyLog('2025-06-15');
    expect(entry!.decisions.length).toBeLessThanOrEqual(10);
  });

  it('includes session count and message count in summary', () => {
    insertSession('s1', '2025-06-15');
    insertSession('s2', '2025-06-15', 'opus');
    insertMessage('s1', 'user', 'Hello');
    insertMessage('s2', 'user', 'World');

    const entry = dailyLog.generateDailyLog('2025-06-15');
    const summary = JSON.parse(entry!.summary);
    expect(summary.sessionsCount).toBe(2);
    expect(summary.totalMessages).toBe(2);
  });

  it('includes unique models in summary', () => {
    insertSession('s1', '2025-06-15', 'sonnet');
    insertSession('s2', '2025-06-15', 'opus');
    insertSession('s3', '2025-06-15', 'sonnet');

    const entry = dailyLog.generateDailyLog('2025-06-15');
    const summary = JSON.parse(entry!.summary);
    expect(summary.models).toContain('sonnet');
    expect(summary.models).toContain('opus');
    expect(summary.models).toHaveLength(2);
  });

  it('counts chat_sessions toward session total', () => {
    insertChatSession('cs1', '2025-06-15');

    const entry = dailyLog.generateDailyLog('2025-06-15');
    expect(entry).not.toBeNull();
    const summary = JSON.parse(entry!.summary);
    expect(summary.sessionsCount).toBe(1);
  });

  // ─── getLog() ───────────────────────────────────────────────

  it('returns null for a date with no log', () => {
    expect(dailyLog.getLog('2025-01-01')).toBeNull();
  });

  it('returns the log entry for a generated date', () => {
    insertSession('s1', '2025-06-15');
    dailyLog.generateDailyLog('2025-06-15');

    const entry = dailyLog.getLog('2025-06-15');
    expect(entry).not.toBeNull();
    expect(entry!.date).toBe('2025-06-15');
  });

  it('parses decisions/blockers/learnings from stored JSON', () => {
    insertSession('s1', '2025-06-15');
    insertMessage('s1', 'user', 'I decided to refactor');
    dailyLog.generateDailyLog('2025-06-15');

    const entry = dailyLog.getLog('2025-06-15');
    expect(Array.isArray(entry!.decisions)).toBe(true);
    expect(Array.isArray(entry!.blockers)).toBe(true);
    expect(Array.isArray(entry!.learnings)).toBe(true);
  });

  // ─── getRecentLogs() ────────────────────────────────────────

  it('returns empty array when no logs exist', () => {
    expect(dailyLog.getRecentLogs()).toEqual([]);
  });

  it('returns logs ordered by date descending', () => {
    insertSession('s1', '2025-06-14');
    insertSession('s2', '2025-06-15');
    insertSession('s3', '2025-06-16');

    dailyLog.generateDailyLog('2025-06-14');
    dailyLog.generateDailyLog('2025-06-15');
    dailyLog.generateDailyLog('2025-06-16');

    const recent = dailyLog.getRecentLogs(3);
    expect(recent).toHaveLength(3);
    expect(recent[0].date).toBe('2025-06-16');
    expect(recent[1].date).toBe('2025-06-15');
    expect(recent[2].date).toBe('2025-06-14');
  });

  it('respects the limit parameter', () => {
    for (let i = 1; i <= 10; i++) {
      const date = `2025-06-${String(i).padStart(2, '0')}`;
      insertSession(`s${i}`, date);
      dailyLog.generateDailyLog(date);
    }

    const recent = dailyLog.getRecentLogs(3);
    expect(recent).toHaveLength(3);
  });

  it('defaults to 7 recent logs', () => {
    for (let i = 1; i <= 10; i++) {
      const date = `2025-06-${String(i).padStart(2, '0')}`;
      insertSession(`s${i}`, date);
      dailyLog.generateDailyLog(date);
    }

    const recent = dailyLog.getRecentLogs();
    expect(recent).toHaveLength(7);
  });
});
