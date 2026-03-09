import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../../src/db/migrations.js';

describe('Phase 0 — Database Migrations', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('creates _migrations table', () => {
    runMigrations(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'")
      .all();
    expect(tables).toHaveLength(1);
  });

  it('creates all required tables', () => {
    runMigrations(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name);

    expect(tables).toContain('sessions');
    expect(tables).toContain('messages');
    expect(tables).toContain('handoffs');
    expect(tables).toContain('daily_logs');
    expect(tables).toContain('memories');
    expect(tables).toContain('stories');
    expect(tables).toContain('audit_log');
    expect(tables).toContain('gate_config');
    expect(tables).toContain('sibling_locks');
  });

  it('creates FTS5 virtual table', () => {
    runMigrations(db);
    const fts = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memories_fts'")
      .all();
    expect(fts).toHaveLength(1);
  });

  it('records migration version in _migrations', () => {
    runMigrations(db);
    const versions = db.prepare('SELECT version, name FROM _migrations').all() as any[];
    expect(versions.length).toBeGreaterThanOrEqual(1);
    expect(versions[0].version).toBe(1);
    expect(versions[0].name).toBe('initial_schema');
  });

  it('is idempotent — running twice does not throw', () => {
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();

    const versions = db.prepare('SELECT version FROM _migrations').all();
    expect(versions).toHaveLength(3); // v1: initial_schema, v2: chat_sessions, v3: agent_teams
  });

  it('creates indexes on messages and audit_log', () => {
    runMigrations(db);
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all()
      .map((r: any) => r.name);

    expect(indexes).toContain('idx_messages_session');
    expect(indexes).toContain('idx_audit_timestamp');
    expect(indexes).toContain('idx_audit_event');
  });

  it('FTS5 sync triggers exist', () => {
    runMigrations(db);
    const triggers = db
      .prepare("SELECT name FROM sqlite_master WHERE type='trigger'")
      .all()
      .map((r: any) => r.name);

    expect(triggers).toContain('memories_ai');
    expect(triggers).toContain('memories_ad');
    expect(triggers).toContain('memories_au');
  });

  it('FTS5 works end-to-end after migration', () => {
    runMigrations(db);

    db.prepare(
      `INSERT INTO memories (id, type, content, importance, tags, source_session, created_at, accessed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'm1',
      'fact',
      'TypeScript is great',
      0.8,
      'language,programming',
      's1',
      Date.now(),
      Date.now(),
    );

    const results = db
      .prepare('SELECT * FROM memories_fts WHERE memories_fts MATCH ?')
      .all('TypeScript');
    expect(results).toHaveLength(1);
  });
});
