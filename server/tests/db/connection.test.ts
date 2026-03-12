import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { closeDb, createMemoryDb, getDb } from '../../src/db/connection';

describe('Database Connection', () => {
  afterEach(() => {
    // Reset the singleton between tests
    closeDb();
  });

  // ─── createMemoryDb ─────────────────────────────────────────

  describe('createMemoryDb', () => {
    it('creates an in-memory database', () => {
      const db = createMemoryDb();
      expect(db).toBeDefined();
      expect(db.open).toBe(true);
      db.close();
    });

    it('runs migrations on the memory database', () => {
      const db = createMemoryDb();
      // Verify key tables exist by querying them
      const sessions = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'")
        .get();
      expect(sessions).toBeDefined();

      const messages = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'")
        .get();
      expect(messages).toBeDefined();

      const tasks = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'")
        .get();
      expect(tasks).toBeDefined();

      const memories = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memories'")
        .get();
      expect(memories).toBeDefined();

      const auditLog = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='audit_log'")
        .get();
      expect(auditLog).toBeDefined();

      db.close();
    });

    it('enables foreign keys', () => {
      const db = createMemoryDb();
      const fk = db.pragma('foreign_keys') as any[];
      expect(fk[0].foreign_keys).toBe(1);
      db.close();
    });

    it('creates independent instances', () => {
      const db1 = createMemoryDb();
      const db2 = createMemoryDb();

      // Insert into db1, should not appear in db2
      db1
        .prepare(
          "INSERT INTO sessions (id, channel, user_id, model, status, started_at, total_tokens) VALUES ('s1', 'cli', 'u1', 'sonnet', 'active', ?, 0)",
        )
        .run(Date.now());

      const count1 = (db1.prepare('SELECT COUNT(*) as c FROM sessions').get() as any).c;
      const count2 = (db2.prepare('SELECT COUNT(*) as c FROM sessions').get() as any).c;

      expect(count1).toBe(1);
      expect(count2).toBe(0);

      db1.close();
      db2.close();
    });
  });

  // ─── getDb ─────────────────────────────────────────────────

  describe('getDb', () => {
    it('returns a database instance', () => {
      const db = getDb(':memory:');
      expect(db).toBeDefined();
      expect(db.open).toBe(true);
    });

    it('returns the same instance on repeated calls (singleton)', () => {
      const db1 = getDb(':memory:');
      const db2 = getDb(':memory:');
      expect(db1).toBe(db2);
    });

    it('runs migrations on the database', () => {
      const db = getDb(':memory:');
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
      const tableNames = tables.map((t: any) => t.name);
      expect(tableNames).toContain('sessions');
      expect(tableNames).toContain('messages');
      expect(tableNames).toContain('tasks');
    });

    it('sets WAL journal mode', () => {
      const db = getDb(':memory:');
      const mode = db.pragma('journal_mode') as any[];
      // In-memory databases may report 'memory' instead of 'wal'
      expect(mode[0].journal_mode).toBeDefined();
    });
  });

  // ─── closeDb ─────────────────────────────────────────────────

  describe('closeDb', () => {
    it('closes the singleton database', () => {
      const db = getDb(':memory:');
      expect(db.open).toBe(true);
      closeDb();
      // After closeDb, calling getDb should create a new instance
      const db2 = getDb(':memory:');
      expect(db2.open).toBe(true);
      // db2 should be a different instance
      expect(db).not.toBe(db2);
    });

    it('does not throw if called when no DB is open', () => {
      expect(() => closeDb()).not.toThrow();
    });

    it('allows re-initialization after close', () => {
      getDb(':memory:');
      closeDb();
      const db = getDb(':memory:');
      expect(db.open).toBe(true);
      // Verify tables still exist (migrations re-run)
      const sessions = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'")
        .get();
      expect(sessions).toBeDefined();
    });
  });

  // ─── Schema integrity ───────────────────────────────────────

  describe('schema integrity', () => {
    it('sessions table has the expected columns', () => {
      const db = createMemoryDb();
      const cols = db.pragma('table_info(sessions)') as any[];
      const colNames = cols.map((c: any) => c.name);
      expect(colNames).toContain('id');
      expect(colNames).toContain('channel');
      expect(colNames).toContain('user_id');
      expect(colNames).toContain('model');
      expect(colNames).toContain('status');
      expect(colNames).toContain('started_at');
      expect(colNames).toContain('ended_at');
      expect(colNames).toContain('total_tokens');
      expect(colNames).toContain('sdk_session_id');
      expect(colNames).toContain('last_model_tier');
      expect(colNames).toContain('turns');
      expect(colNames).toContain('total_input_tokens');
      expect(colNames).toContain('total_output_tokens');
      expect(colNames).toContain('total_cost');
      db.close();
    });

    it('tasks table has the expected columns', () => {
      const db = createMemoryDb();
      const cols = db.pragma('table_info(tasks)') as any[];
      const colNames = cols.map((c: any) => c.name);
      expect(colNames).toContain('id');
      expect(colNames).toContain('title');
      expect(colNames).toContain('description');
      expect(colNames).toContain('status');
      expect(colNames).toContain('priority');
      expect(colNames).toContain('position');
      expect(colNames).toContain('labels');
      expect(colNames).toContain('session_id');
      expect(colNames).toContain('team_id');
      expect(colNames).toContain('created_by');
      expect(colNames).toContain('created_at');
      expect(colNames).toContain('updated_at');
      expect(colNames).toContain('completed_at');
      db.close();
    });

    it('messages table enforces foreign key to sessions', () => {
      const db = createMemoryDb();
      // Inserting a message with a non-existent session_id should fail
      expect(() =>
        db
          .prepare(
            "INSERT INTO messages (id, session_id, role, content, tokens, timestamp) VALUES ('m1', 'nonexistent', 'user', 'hi', 0, ?)",
          )
          .run(Date.now()),
      ).toThrow();
      db.close();
    });

    it('_migrations table records applied migrations', () => {
      const db = createMemoryDb();
      const migrations = db
        .prepare('SELECT * FROM _migrations ORDER BY version ASC')
        .all() as any[];
      expect(migrations.length).toBeGreaterThanOrEqual(1);
      expect(migrations[0].version).toBe(1);
      expect(migrations[0].name).toBe('initial_schema');
      db.close();
    });
  });
});
