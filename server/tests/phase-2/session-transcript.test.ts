import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryDb } from '../../src/db/connection';
import { SessionTranscript } from '../../src/memory/session-transcript';

describe('SessionTranscript (Tier 1)', () => {
  let db: Database.Database;
  let transcript: SessionTranscript;

  beforeEach(() => {
    db = createMemoryDb();
    // Create a session for FK constraints
    db.prepare(
      `INSERT INTO sessions (id, channel, user_id, model, status, started_at, total_tokens)
       VALUES ('s1', 'cli', 'user1', 'sonnet', 'active', ?, 0)`,
    ).run(Date.now());
    db.prepare(
      `INSERT INTO sessions (id, channel, user_id, model, status, started_at, total_tokens)
       VALUES ('s2', 'cli', 'user1', 'sonnet', 'active', ?, 0)`,
    ).run(Date.now());
    transcript = new SessionTranscript(db);
  });

  it('records a message and retrieves it', () => {
    transcript.record('s1', 'user', 'Hello Neo');
    const history = transcript.getHistory('s1');
    expect(history).toHaveLength(1);
    expect(history[0].content).toBe('Hello Neo');
    expect(history[0].role).toBe('user');
  });

  it('returns messages in chronological order', () => {
    transcript.record('s1', 'user', 'First');
    transcript.record('s1', 'assistant', 'Second');
    transcript.record('s1', 'user', 'Third');
    const history = transcript.getHistory('s1');
    expect(history.map((m: any) => m.content)).toEqual(['First', 'Second', 'Third']);
  });

  it('isolates messages by session', () => {
    transcript.record('s1', 'user', 'Session 1');
    transcript.record('s2', 'user', 'Session 2');
    expect(transcript.getHistory('s1')).toHaveLength(1);
    expect(transcript.getHistory('s2')).toHaveLength(1);
  });

  it('estimates tokens at ~4 chars per token', () => {
    expect(transcript.estimateTokens('Hello world')).toBe(3); // 11 / 4 = 2.75 → ceil = 3
    expect(transcript.estimateTokens('')).toBe(0);
  });

  it('calculates total tokens for a session', () => {
    transcript.record('s1', 'user', 'Hello world', 3);
    transcript.record('s1', 'assistant', 'Hi there, how can I help?', 7);
    expect(transcript.getTotalTokens('s1')).toBe(10);
  });

  it('respects limit parameter in getHistory', () => {
    for (let i = 0; i < 20; i++) transcript.record('s1', 'user', `Message ${i}`);
    expect(transcript.getHistory('s1', 5)).toHaveLength(5);
  });

  it('counts messages in a session', () => {
    transcript.record('s1', 'user', 'One');
    transcript.record('s1', 'assistant', 'Two');
    expect(transcript.getMessageCount('s1')).toBe(2);
    expect(transcript.getMessageCount('s2')).toBe(0);
  });
});
