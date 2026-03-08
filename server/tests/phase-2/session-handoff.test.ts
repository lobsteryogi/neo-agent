import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryDb } from '../../src/db/connection';
import { SessionHandoff } from '../../src/memory/session-handoff';
import { SessionTranscript } from '../../src/memory/session-transcript';

describe('SessionHandoff (Tier 2: Red Pill Moments)', () => {
  let db: Database.Database;
  let handoff: SessionHandoff;
  let transcript: SessionTranscript;

  beforeEach(() => {
    db = createMemoryDb();
    db.prepare(
      `INSERT INTO sessions (id, channel, user_id, model, status, started_at, total_tokens)
       VALUES ('s1', 'cli', 'user1', 'sonnet', 'active', ?, 0)`,
    ).run(Date.now());
    transcript = new SessionTranscript(db);
    handoff = new SessionHandoff(db, { fadeThreshold: 0.85 });
  });

  it('does NOT trigger handoff below 85% threshold', () => {
    const result = handoff.checkForFade({ id: 's1', model: 'sonnet' }, 100_000);
    expect(result.fading).toBe(false);
    expect(result.ratio).toBeCloseTo(0.5);
  });

  it('triggers handoff at 85% threshold', () => {
    const result = handoff.checkForFade({ id: 's1', model: 'sonnet' }, 170_000);
    expect(result.fading).toBe(true);
    expect(result.snapshotId).toBeDefined();
  });

  it('triggers handoff above 85%', () => {
    const result = handoff.checkForFade({ id: 's1', model: 'sonnet' }, 190_000);
    expect(result.fading).toBe(true);
  });

  it('snapshot contains expected structure', () => {
    const result = handoff.checkForFade({ id: 's1', model: 'sonnet' }, 180_000);
    expect(result.fading).toBe(true);

    const row = db.prepare('SELECT snapshot FROM handoffs WHERE session_id = ?').get('s1') as any;
    const snapshot = JSON.parse(row.snapshot);
    expect(snapshot).toHaveProperty('decisions');
    expect(snapshot).toHaveProperty('keyFacts');
    expect(snapshot).toHaveProperty('openQuestions');
    expect(snapshot).toHaveProperty('workInProgress');
    expect(snapshot).toHaveProperty('userPreferences');
    expect(snapshot).toHaveProperty('timestamp');
  });

  it('respects custom threshold', () => {
    const strict = new SessionHandoff(db, { fadeThreshold: 0.5 });
    const result = strict.checkForFade({ id: 's1', model: 'sonnet' }, 110_000);
    expect(result.fading).toBe(true); // 55% > 50%
  });

  it('getLatestHandoff returns null when none exist', () => {
    expect(handoff.getLatestHandoff('s1')).toBeNull();
  });

  it('getLatestHandoff returns the most recent snapshot', () => {
    handoff.checkForFade({ id: 's1', model: 'sonnet' }, 180_000);
    const latest = handoff.getLatestHandoff('s1');
    expect(latest).not.toBeNull();
    expect(latest!.decisions).toBeDefined();
  });

  it('extracts patterns from user messages', () => {
    // Add messages with extractable patterns
    transcript.record('s1', 'user', 'I prefer TypeScript over JavaScript');
    transcript.record('s1', 'user', 'We decided to use SQLite');
    transcript.record('s1', 'user', 'What about the deployment?');

    const result = handoff.checkForFade({ id: 's1', model: 'sonnet' }, 180_000);
    expect(result.fading).toBe(true);

    const snapshot = handoff.getLatestHandoff('s1')!;
    expect(snapshot.userPreferences.length).toBeGreaterThanOrEqual(1);
    expect(snapshot.decisions.length).toBeGreaterThanOrEqual(1);
  });
});
