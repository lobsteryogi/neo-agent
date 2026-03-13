import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryDb } from '../../src/db/connection';
import { SessionManager } from '../../src/cli/lib/sessions';

describe('SessionManager', () => {
  let db: Database.Database;
  let mgr: SessionManager;

  beforeEach(() => {
    db = createMemoryDb();
    mgr = new SessionManager(db);
  });

  afterEach(() => {
    db.close();
  });

  // ─── Constructor / Default Session ──────────────────────────────

  describe('constructor', () => {
    it('creates a default session on initialization', () => {
      expect(mgr.current).toBeDefined();
      expect(mgr.current.id).toBe('default');
    });

    it('default session starts with zero counters', () => {
      expect(mgr.current.turns).toBe(0);
      expect(mgr.current.totalInputTokens).toBe(0);
      expect(mgr.current.totalOutputTokens).toBe(0);
      expect(mgr.current.totalCost).toBe(0);
    });

    it('loads existing sessions from database', () => {
      // Create a session via the first manager
      mgr.create('persist-test');
      mgr.get('persist-test')!.turns = 7;
      mgr.save(mgr.get('persist-test')!);

      // Create a second manager from the same db
      const mgr2 = new SessionManager(db);
      expect(mgr2.has('persist-test')).toBe(true);
      expect(mgr2.get('persist-test')!.turns).toBe(7);
    });
  });

  // ─── create ─────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a session with a given name', () => {
      const session = mgr.create('alpha');
      expect(session.id).toBe('alpha');
      expect(session.turns).toBe(0);
      expect(session.totalCost).toBe(0);
    });

    it('creates a session with random ID when no name given', () => {
      const session = mgr.create();
      expect(session.id).toBeTruthy();
      expect(session.id.length).toBe(8); // randomBytes(4).toString('hex') = 8 chars
    });

    it('sets current to the newly created session', () => {
      mgr.create('new-one');
      expect(mgr.current.id).toBe('new-one');
    });

    it('persists to the database', () => {
      mgr.create('db-check');
      const row = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get('db-check') as any;
      expect(row).toBeDefined();
      expect(row.id).toBe('db-check');
      expect(row.turns).toBe(0);
    });

    it('creates a matching sessions table row for FK constraints', () => {
      mgr.create('fk-test');
      const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get('fk-test') as any;
      expect(row).toBeDefined();
      expect(row.channel).toBe('cli');
    });
  });

  // ─── has ────────────────────────────────────────────────────────

  describe('has', () => {
    it('returns true for existing session', () => {
      expect(mgr.has('default')).toBe(true);
    });

    it('returns false for non-existing session', () => {
      expect(mgr.has('nonexistent')).toBe(false);
    });

    it('returns true after creating a session', () => {
      mgr.create('check-me');
      expect(mgr.has('check-me')).toBe(true);
    });
  });

  // ─── get ────────────────────────────────────────────────────────

  describe('get', () => {
    it('returns the session for an existing ID', () => {
      const session = mgr.get('default');
      expect(session).toBeDefined();
      expect(session!.id).toBe('default');
    });

    it('returns undefined for non-existing ID', () => {
      expect(mgr.get('nope')).toBeUndefined();
    });
  });

  // ─── all ────────────────────────────────────────────────────────

  describe('all', () => {
    it('returns a Map of all sessions', () => {
      const all = mgr.all();
      expect(all).toBeInstanceOf(Map);
      expect(all.has('default')).toBe(true);
    });

    it('reflects newly created sessions', () => {
      mgr.create('s1');
      mgr.create('s2');
      const all = mgr.all();
      expect(all.size).toBe(3); // default + s1 + s2
      expect(all.has('s1')).toBe(true);
      expect(all.has('s2')).toBe(true);
    });
  });

  // ─── switchTo ───────────────────────────────────────────────────

  describe('switchTo', () => {
    it('switches to an existing session', () => {
      mgr.create('target');
      mgr.create('other');
      expect(mgr.current.id).toBe('other');

      mgr.switchTo('target');
      expect(mgr.current.id).toBe('target');
    });

    it('creates a new session if ID does not exist', () => {
      const session = mgr.switchTo('brand-new');
      expect(session.id).toBe('brand-new');
      expect(mgr.current.id).toBe('brand-new');
      expect(mgr.has('brand-new')).toBe(true);
    });

    it('returns the session object', () => {
      mgr.create('ret-test');
      const returned = mgr.switchTo('ret-test');
      expect(returned.id).toBe('ret-test');
    });
  });

  // ─── save ───────────────────────────────────────────────────────

  describe('save', () => {
    it('persists updated session stats to database', () => {
      const session = mgr.current;
      session.turns = 42;
      session.totalInputTokens = 10000;
      session.totalOutputTokens = 5000;
      session.totalCost = 1.23;
      mgr.save(session);

      const row = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(session.id) as any;
      expect(row.turns).toBe(42);
      expect(row.total_input_tokens).toBe(10000);
      expect(row.total_output_tokens).toBe(5000);
      expect(row.total_cost).toBe(1.23);
    });

    it('upserts on conflict — second save updates', () => {
      const session = mgr.current;
      session.turns = 1;
      mgr.save(session);

      session.turns = 2;
      mgr.save(session);

      const row = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(session.id) as any;
      expect(row.turns).toBe(2);
    });

    it('preserves sdkSessionId', () => {
      const session = mgr.current;
      session.sdkSessionId = 'sdk-abc-123';
      mgr.save(session);

      const row = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(session.id) as any;
      expect(row.sdk_session_id).toBe('sdk-abc-123');
    });

    it('saves null for sdkSessionId when undefined', () => {
      const session = mgr.current;
      session.sdkSessionId = undefined;
      mgr.save(session);

      const row = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(session.id) as any;
      expect(row.sdk_session_id).toBeNull();
    });

    it('saves lastModelTier on initial insert', () => {
      // Create a brand-new session so the INSERT path is taken (not UPDATE)
      const session = mgr.create('model-test');
      // The row already exists from create(), so we need to test the INSERT path.
      // Delete the row first, then re-save with lastModelTier set.
      db.prepare('DELETE FROM chat_sessions WHERE id = ?').run('model-test');
      session.lastModelTier = 'opus';
      mgr.save(session);

      const row = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get('model-test') as any;
      expect(row.last_model).toBe('opus');
    });

    it('persists lastModelTier on conflict update', () => {
      const session = mgr.current;
      session.lastModelTier = 'opus';
      mgr.save(session);

      const row = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(session.id) as any;
      expect(row.last_model).toBe('opus');
    });
  });

  // ─── Persistence across instances ──────────────────────────────

  describe('persistence', () => {
    it('loads sessions with correct field mapping', () => {
      const session = mgr.create('mapped');
      session.turns = 15;
      session.totalInputTokens = 3000;
      session.totalOutputTokens = 1500;
      session.totalCost = 0.35;
      session.sdkSessionId = 'sdk-xyz';
      mgr.save(session);

      const mgr2 = new SessionManager(db);
      const loaded = mgr2.get('mapped');
      expect(loaded).toBeDefined();
      expect(loaded!.turns).toBe(15);
      expect(loaded!.totalInputTokens).toBe(3000);
      expect(loaded!.totalOutputTokens).toBe(1500);
      expect(loaded!.totalCost).toBe(0.35);
      expect(loaded!.sdkSessionId).toBe('sdk-xyz');
    });

    it('loads lastModelTier when set via direct INSERT', () => {
      // Simulate a fresh row with last_model set
      db.prepare(
        `INSERT INTO chat_sessions (id, sdk_session_id, turns, total_input_tokens, total_output_tokens, total_cost, last_model, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('model-load', null, 0, 0, 0, 0, 'haiku', Date.now(), Date.now());
      // Also add sessions table row for FK
      db.prepare(
        `INSERT OR IGNORE INTO sessions (id, channel, user_id, model, status, started_at, total_tokens)
         VALUES (?, 'cli', 'user', 'sonnet', 'active', ?, 0)`,
      ).run('model-load', Date.now());

      const mgr2 = new SessionManager(db);
      const loaded = mgr2.get('model-load');
      expect(loaded).toBeDefined();
      expect(loaded!.lastModelTier).toBe('haiku');
    });

    it('preserves multiple sessions across instances', () => {
      mgr.create('s-a');
      mgr.create('s-b');
      mgr.create('s-c');

      const mgr2 = new SessionManager(db);
      expect(mgr2.has('s-a')).toBe(true);
      expect(mgr2.has('s-b')).toBe(true);
      expect(mgr2.has('s-c')).toBe(true);
    });
  });
});
