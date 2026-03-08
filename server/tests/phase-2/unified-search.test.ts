import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryDb } from '../../src/db/connection';
import { LongTermMemory } from '../../src/memory/long-term';
import { MemorySearch } from '../../src/memory/search';

describe('MemorySearch (Unified)', () => {
  let db: Database.Database;
  let search: MemorySearch;
  let longTerm: LongTermMemory;

  beforeEach(() => {
    db = createMemoryDb();
    search = new MemorySearch(db);
    longTerm = new LongTermMemory(db);
  });

  it('returns results from long-term memory tier', () => {
    longTerm.store({
      type: 'fact',
      content: 'TypeScript is the primary language',
      importance: 0.8,
      tags: ['typescript'],
      sourceSession: 's1',
    });
    const results = search.search('TypeScript');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.source === 'long-term')).toBe(true);
  });

  it('returns results from handoff tier', () => {
    // Insert a handoff directly
    db.prepare(
      `INSERT INTO sessions (id, channel, user_id, model, status, started_at, total_tokens)
       VALUES ('s1', 'cli', 'u1', 'sonnet', 'active', ?, 0)`,
    ).run(Date.now());
    db.prepare(
      `INSERT INTO handoffs (id, session_id, snapshot, context_size, created_at)
       VALUES ('h1', 's1', '{"decisions":["use Docker for deployment"]}', 100000, ?)`,
    ).run(Date.now());

    const results = search.search('Docker');
    expect(results.some((r) => r.source === 'handoff')).toBe(true);
  });

  it('returns results from daily log tier', () => {
    db.prepare(
      `INSERT INTO daily_logs (id, date, summary, decisions, blockers, learnings, created_at)
       VALUES ('dl1', '2026-03-08', '{"tasks":"deployed the API"}', '[]', '[]', '["learned about caching"]', ?)`,
    ).run(Date.now());

    const results = search.search('deployed');
    expect(results.some((r) => r.source === 'daily-log')).toBe(true);
  });

  it('returns empty array when nothing matches', () => {
    const results = search.search('xyznonexistenttopic123');
    expect(results).toHaveLength(0);
  });

  it('filters by source when specified', () => {
    longTerm.store({
      type: 'fact',
      content: 'Filterable content here',
      importance: 0.5,
      tags: [],
      sourceSession: 's1',
    });

    const onlyLongTerm = search.search('Filterable', { sources: ['long-term'] });
    expect(onlyLongTerm.every((r) => r.source === 'long-term')).toBe(true);
  });
});
