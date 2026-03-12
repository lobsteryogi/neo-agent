import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryDb } from '../../src/db/connection';
import { SessionManager } from '../../src/core/session';

describe('SessionManager', () => {
  let db: Database.Database;
  let sessions: SessionManager;

  beforeEach(() => {
    db = createMemoryDb();
    sessions = new SessionManager(db, 'sonnet');
  });

  afterEach(() => {
    db.close();
  });

  // ─── resolveOrCreate ─────────────────────────────────────────

  describe('resolveOrCreate', () => {
    it('creates a new session when none exists', () => {
      const session = sessions.resolveOrCreate('ch-1', 'user-1', 'cli');
      expect(session).toBeDefined();
      expect(session.id).toBeTruthy();
      expect(session.channel).toBe('cli');
      expect(session.userId).toBe('user-1');
      expect(session.model).toBe('sonnet');
      expect(session.status).toBe('active');
      expect(session.totalTokens).toBe(0);
      expect(session.turns).toBe(0);
      expect(session.totalCost).toBe(0);
    });

    it('returns the same session on repeated calls for the same user/channel', () => {
      const s1 = sessions.resolveOrCreate('ch-1', 'user-1', 'cli');
      const s2 = sessions.resolveOrCreate('ch-1', 'user-1', 'cli');
      expect(s1.id).toBe(s2.id);
    });

    it('creates separate sessions for different users', () => {
      const s1 = sessions.resolveOrCreate('ch-1', 'user-1', 'cli');
      const s2 = sessions.resolveOrCreate('ch-1', 'user-2', 'cli');
      expect(s1.id).not.toBe(s2.id);
    });

    it('creates separate sessions for different channels', () => {
      const s1 = sessions.resolveOrCreate('ch-1', 'user-1', 'cli');
      const s2 = sessions.resolveOrCreate('ch-2', 'user-1', 'telegram');
      expect(s1.id).not.toBe(s2.id);
    });

    it('uses the configured default model', () => {
      const customSessions = new SessionManager(db, 'opus');
      const session = customSessions.resolveOrCreate('ch-1', 'user-3', 'cli');
      expect(session.model).toBe('opus');
    });

    it('defaults to sonnet when no default model is specified', () => {
      const defaultSessions = new SessionManager(db);
      const session = defaultSessions.resolveOrCreate('ch-1', 'user-4', 'cli');
      expect(session.model).toBe('sonnet');
    });

    it('defaults channel to cli when not specified', () => {
      const session = sessions.resolveOrCreate('ch-1', 'user-1');
      expect(session.channel).toBe('cli');
    });

    it('does not return ended sessions', () => {
      const s1 = sessions.resolveOrCreate('ch-1', 'user-1', 'cli');
      sessions.end(s1.id);
      const s2 = sessions.resolveOrCreate('ch-1', 'user-1', 'cli');
      expect(s2.id).not.toBe(s1.id);
    });
  });

  // ─── end ─────────────────────────────────────────────────────

  describe('end', () => {
    it('marks a session as ended', () => {
      const session = sessions.resolveOrCreate('ch-1', 'user-1', 'cli');
      sessions.end(session.id);

      // After ending, resolveOrCreate should create a new session
      const next = sessions.resolveOrCreate('ch-1', 'user-1', 'cli');
      expect(next.id).not.toBe(session.id);
    });

    it('sets ended_at timestamp', () => {
      const session = sessions.resolveOrCreate('ch-1', 'user-1', 'cli');
      sessions.end(session.id);

      const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id) as any;
      expect(row.status).toBe('ended');
      expect(row.ended_at).toBeTruthy();
    });

    it('does not throw when ending a non-existent session', () => {
      expect(() => sessions.end('nonexistent-id')).not.toThrow();
    });
  });

  // ─── updateTokens ──────────────────────────────────────────

  describe('updateTokens', () => {
    it('increments total_tokens', () => {
      const session = sessions.resolveOrCreate('ch-1', 'user-1', 'cli');
      sessions.updateTokens(session.id, 100);

      const row = db
        .prepare('SELECT total_tokens FROM sessions WHERE id = ?')
        .get(session.id) as any;
      expect(row.total_tokens).toBe(100);
    });

    it('accumulates across multiple calls', () => {
      const session = sessions.resolveOrCreate('ch-1', 'user-1', 'cli');
      sessions.updateTokens(session.id, 100);
      sessions.updateTokens(session.id, 200);
      sessions.updateTokens(session.id, 50);

      const row = db
        .prepare('SELECT total_tokens FROM sessions WHERE id = ?')
        .get(session.id) as any;
      expect(row.total_tokens).toBe(350);
    });
  });

  // ─── updateExtendedState ────────────────────────────────────

  describe('updateExtendedState', () => {
    it('updates sdkSessionId', () => {
      const session = sessions.resolveOrCreate('ch-1', 'user-1', 'cli');
      sessions.updateExtendedState(session.id, { sdkSessionId: 'sdk-abc' });

      const row = db
        .prepare('SELECT sdk_session_id FROM sessions WHERE id = ?')
        .get(session.id) as any;
      expect(row.sdk_session_id).toBe('sdk-abc');
    });

    it('updates lastModelTier', () => {
      const session = sessions.resolveOrCreate('ch-1', 'user-1', 'cli');
      sessions.updateExtendedState(session.id, { lastModelTier: 'opus' });

      const row = db
        .prepare('SELECT last_model_tier FROM sessions WHERE id = ?')
        .get(session.id) as any;
      expect(row.last_model_tier).toBe('opus');
    });

    it('updates turns', () => {
      const session = sessions.resolveOrCreate('ch-1', 'user-1', 'cli');
      sessions.updateExtendedState(session.id, { turns: 5 });

      const row = db.prepare('SELECT turns FROM sessions WHERE id = ?').get(session.id) as any;
      expect(row.turns).toBe(5);
    });

    it('updates total cost and token fields', () => {
      const session = sessions.resolveOrCreate('ch-1', 'user-1', 'cli');
      sessions.updateExtendedState(session.id, {
        totalInputTokens: 1000,
        totalOutputTokens: 500,
        totalCost: 0.05,
      });

      const row = db
        .prepare(
          'SELECT total_input_tokens, total_output_tokens, total_cost FROM sessions WHERE id = ?',
        )
        .get(session.id) as any;
      expect(row.total_input_tokens).toBe(1000);
      expect(row.total_output_tokens).toBe(500);
      expect(row.total_cost).toBeCloseTo(0.05);
    });

    it('updates multiple fields at once', () => {
      const session = sessions.resolveOrCreate('ch-1', 'user-1', 'cli');
      sessions.updateExtendedState(session.id, {
        sdkSessionId: 'sdk-xyz',
        lastModelTier: 'haiku',
        turns: 3,
        totalCost: 0.01,
      });

      const row = db
        .prepare(
          'SELECT sdk_session_id, last_model_tier, turns, total_cost FROM sessions WHERE id = ?',
        )
        .get(session.id) as any;
      expect(row.sdk_session_id).toBe('sdk-xyz');
      expect(row.last_model_tier).toBe('haiku');
      expect(row.turns).toBe(3);
      expect(row.total_cost).toBeCloseTo(0.01);
    });

    it('does nothing when update object is empty', () => {
      const session = sessions.resolveOrCreate('ch-1', 'user-1', 'cli');
      // Should not throw or modify anything
      expect(() => sessions.updateExtendedState(session.id, {})).not.toThrow();
    });

    it('resolveOrCreate returns updated extended state', () => {
      const session = sessions.resolveOrCreate('ch-1', 'user-1', 'cli');
      sessions.updateExtendedState(session.id, {
        sdkSessionId: 'sdk-resolve',
        lastModelTier: 'opus',
        turns: 7,
        totalInputTokens: 2000,
        totalOutputTokens: 800,
        totalCost: 0.12,
      });

      const resolved = sessions.resolveOrCreate('ch-1', 'user-1', 'cli');
      expect(resolved.sdkSessionId).toBe('sdk-resolve');
      expect(resolved.lastModelTier).toBe('opus');
      expect(resolved.turns).toBe(7);
      expect(resolved.totalInputTokens).toBe(2000);
      expect(resolved.totalOutputTokens).toBe(800);
      expect(resolved.totalCost).toBeCloseTo(0.12);
    });
  });
});
