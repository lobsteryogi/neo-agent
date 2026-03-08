import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryDb } from '../../src/db/connection';
import { LongTermMemory } from '../../src/memory/long-term';

describe('LongTermMemory + FTS5 (Tier 4)', () => {
  let db: Database.Database;
  let memory: LongTermMemory;

  beforeEach(() => {
    db = createMemoryDb();
    memory = new LongTermMemory(db);
  });

  it('stores and retrieves a memory via FTS5', () => {
    memory.store({
      type: 'fact',
      content: 'User prefers dark mode',
      importance: 0.8,
      tags: ['preference', 'ui'],
      sourceSession: 's1',
    });
    const results = memory.searchFTS('dark mode');
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('dark mode');
  });

  it('FTS5 matches partial content', () => {
    memory.store({
      type: 'fact',
      content: 'The deployment pipeline uses Docker containers',
      importance: 0.5,
      tags: ['devops'],
      sourceSession: 's1',
    });
    expect(memory.searchFTS('Docker')).toHaveLength(1);
    expect(memory.searchFTS('pipeline')).toHaveLength(1);
  });

  it('FTS5 searches tags', () => {
    memory.store({
      type: 'preference',
      content: 'Likes TypeScript',
      importance: 0.7,
      tags: ['language', 'typescript'],
      sourceSession: 's1',
    });
    expect(memory.searchFTS('typescript')).toHaveLength(1);
  });

  it('returns empty array for non-matching queries', () => {
    memory.store({
      type: 'fact',
      content: 'React is a UI library',
      importance: 0.5,
      tags: [],
      sourceSession: 's1',
    });
    expect(memory.searchFTS('Vue.js')).toHaveLength(0);
  });

  it('respects limit parameter', () => {
    for (let i = 0; i < 20; i++) {
      memory.store({
        type: 'fact',
        content: `Fact about testing ${i}`,
        importance: 0.5,
        tags: ['testing'],
        sourceSession: 's1',
      });
    }
    expect(memory.searchFTS('testing', 5)).toHaveLength(5);
  });

  it('touch() updates accessed_at timestamp', () => {
    const id = memory.store({
      type: 'fact',
      content: 'test memory',
      importance: 0.5,
      tags: [],
      sourceSession: 's1',
    });
    const before = db.prepare('SELECT accessed_at FROM memories WHERE id = ?').get(id) as any;
    // Small delay to ensure timestamp changes
    memory.touch(id);
    const after = db.prepare('SELECT accessed_at FROM memories WHERE id = ?').get(id) as any;
    expect(after.accessed_at).toBeGreaterThanOrEqual(before.accessed_at);
  });

  it('getRecent returns stored memories', () => {
    memory.store({
      type: 'fact',
      content: 'Old fact',
      importance: 0.5,
      tags: [],
      sourceSession: 's1',
    });
    memory.store({
      type: 'fact',
      content: 'New fact',
      importance: 0.5,
      tags: [],
      sourceSession: 's1',
    });
    const recent = memory.getRecent(2);
    expect(recent).toHaveLength(2);
    const contents = recent.map((m: any) => m.content);
    expect(contents).toContain('Old fact');
    expect(contents).toContain('New fact');
  });

  it('count() returns total number of memories', () => {
    expect(memory.count()).toBe(0);
    memory.store({ type: 'fact', content: 'One', importance: 0.5, tags: [], sourceSession: 's1' });
    memory.store({ type: 'fact', content: 'Two', importance: 0.5, tags: [], sourceSession: 's1' });
    expect(memory.count()).toBe(2);
  });

  it('delete() removes a memory', () => {
    const id = memory.store({
      type: 'fact',
      content: 'Temp',
      importance: 0.5,
      tags: [],
      sourceSession: 's1',
    });
    expect(memory.count()).toBe(1);
    memory.delete(id);
    expect(memory.count()).toBe(0);
  });

  it('handles invalid FTS5 syntax gracefully', () => {
    const results = memory.searchFTS('AND OR NOT');
    expect(results).toEqual([]);
  });
});
