import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryDb } from '../../src/db/connection';
import { Historian } from '../../src/harness/historian';

describe('Historian (Audit Logging)', () => {
  let db: Database.Database;
  let historian: Historian;

  beforeEach(() => {
    db = createMemoryDb();
    historian = new Historian(db);
  });

  it('has the correct wrapper name', () => {
    expect(historian.name).toBe('Historian');
  });

  // ─── log() ──────────────────────────────────────────────────

  it('writes an audit log entry to the database', () => {
    historian.log('session-1', 'test_event', { key: 'value' });

    const rows = db.prepare('SELECT * FROM audit_log').all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].session_id).toBe('session-1');
    expect(rows[0].event_type).toBe('test_event');
    expect(JSON.parse(rows[0].details)).toEqual({ key: 'value' });
  });

  it('records a timestamp in the audit log', () => {
    const before = Date.now();
    historian.log('session-1', 'timed_event');
    const after = Date.now();

    const row = db.prepare('SELECT timestamp FROM audit_log').get() as any;
    expect(row.timestamp).toBeGreaterThanOrEqual(before);
    expect(row.timestamp).toBeLessThanOrEqual(after);
  });

  it('writes multiple log entries', () => {
    historian.log('s1', 'event_a');
    historian.log('s1', 'event_b');
    historian.log('s2', 'event_c');

    const rows = db.prepare('SELECT * FROM audit_log').all() as any[];
    expect(rows).toHaveLength(3);
  });

  it('defaults details to empty object', () => {
    historian.log('session-1', 'simple_event');
    const row = db.prepare('SELECT details FROM audit_log').get() as any;
    expect(JSON.parse(row.details)).toEqual({});
  });

  it('does not throw when database write fails', () => {
    db.close();
    // Should not throw even though db is closed
    expect(() => historian.log('session-1', 'will_fail')).not.toThrow();
  });

  // ─── logError() ─────────────────────────────────────────────

  it('logs errors with message and truncated stack', () => {
    const err = new Error('Something broke');
    historian.logError('session-1', err);

    const row = db.prepare('SELECT * FROM audit_log').get() as any;
    expect(row.event_type).toBe('error');
    const details = JSON.parse(row.details);
    expect(details.message).toBe('Something broke');
    expect(details.stack).toBeDefined();
  });

  it('truncates error stacks to 500 characters', () => {
    const err = new Error('Big error');
    // Override stack with a long string
    err.stack = 'X'.repeat(1000);
    historian.logError('session-1', err);

    const row = db.prepare('SELECT * FROM audit_log').get() as any;
    const details = JSON.parse(row.details);
    expect(details.stack.length).toBeLessThanOrEqual(500);
  });

  // ─── logGateBlock() ─────────────────────────────────────────

  it('logs gate block verdicts', () => {
    historian.logGateBlock('session-1', {
      blocked: true,
      gate: 'TestGate',
      reason: 'Not allowed',
    });

    const row = db.prepare('SELECT * FROM audit_log').get() as any;
    expect(row.event_type).toBe('gate_blocked');
    const details = JSON.parse(row.details);
    expect(details.gate).toBe('TestGate');
    expect(details.reason).toBe('Not allowed');
  });

  // ─── logGuardrailBlock() ────────────────────────────────────

  it('logs guardrail block verdicts', () => {
    historian.logGuardrailBlock('session-1', {
      blocked: true,
      guard: 'TestGuard',
      reason: 'Suspicious content',
    });

    const row = db.prepare('SELECT * FROM audit_log').get() as any;
    expect(row.event_type).toBe('guardrail_blocked');
    const details = JSON.parse(row.details);
    expect(details.guard).toBe('TestGuard');
    expect(details.reason).toBe('Suspicious content');
  });

  // ─── process() (HarnessWrapper) ────────────────────────────

  it('process() logs the response and returns it unmodified', async () => {
    const response = {
      content: 'Hello',
      model: 'sonnet' as const,
      tokensUsed: 100,
    };
    const session = {
      id: 'session-42',
      channel: 'cli' as const,
      model: 'sonnet' as const,
      status: 'active' as const,
      startedAt: Date.now(),
      totalTokens: 0,
    };

    const result = await historian.process(response, session);

    // Should return response unchanged
    expect(result).toEqual(response);

    // Should have logged it
    const row = db.prepare('SELECT * FROM audit_log').get() as any;
    expect(row.session_id).toBe('session-42');
    expect(row.event_type).toBe('response');
    const details = JSON.parse(row.details);
    expect(details.model).toBe('sonnet');
    expect(details.tokensUsed).toBe(100);
    expect(details.hasContent).toBe(true);
  });

  it('process() uses "unknown" session id when no session is provided', async () => {
    const response = { content: 'Test' };
    await historian.process(response);

    const row = db.prepare('SELECT * FROM audit_log').get() as any;
    expect(row.session_id).toBe('unknown');
  });

  it('process() detects hasContent from validatedContent', async () => {
    const response = { validatedContent: 'Validated text' };
    await historian.process(response);

    const row = db.prepare('SELECT * FROM audit_log').get() as any;
    const details = JSON.parse(row.details);
    expect(details.hasContent).toBe(true);
  });

  it('process() detects hasContent as false when no content', async () => {
    const response = { model: 'haiku' as const };
    await historian.process(response);

    const row = db.prepare('SELECT * FROM audit_log').get() as any;
    const details = JSON.parse(row.details);
    expect(details.hasContent).toBe(false);
  });
});
