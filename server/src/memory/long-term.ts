/**
 * ░▒▓ LONG-TERM MEMORY ▓▒░ (Tier 4: Déjà Vu Core)
 *
 * "I've seen this before... or have I?"
 *
 * Persistent facts, preferences, decisions extracted from conversations.
 * FTS5-indexed for fast keyword search. Decay-tracked via accessed_at.
 */

import type { MemoryEntry, MemorySearchResult } from '@neo-agent/shared';
import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';

export class LongTermMemory {
  constructor(private db: Database.Database) {}

  store(entry: Omit<MemoryEntry, 'id'> & { id?: string }): string {
    const id = entry.id ?? nanoid();
    this.db
      .prepare(
        `INSERT INTO memories (id, type, content, importance, tags, source_session, created_at, accessed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        entry.type,
        entry.content,
        entry.importance,
        Array.isArray(entry.tags) ? entry.tags.join(',') : entry.tags,
        entry.sourceSession,
        Date.now(),
        Date.now(),
      );

    // FTS5 is auto-synced via triggers — no manual insert needed
    return id;
  }

  searchFTS(query: string, limit = 10): MemorySearchResult[] {
    try {
      return this.db
        .prepare(
          `SELECT m.*, memories_fts.rank as relevance
           FROM memories_fts
           JOIN memories m ON memories_fts.rowid = m.rowid
           WHERE memories_fts MATCH ?
           ORDER BY rank
           LIMIT ?`,
        )
        .all(query, limit) as MemorySearchResult[];
    } catch {
      // FTS5 MATCH can throw on invalid syntax — return empty
      return [];
    }
  }

  touch(memoryId: string): void {
    this.db.prepare('UPDATE memories SET accessed_at = ? WHERE id = ?').run(Date.now(), memoryId);
  }

  getRecent(limit = 10): MemoryEntry[] {
    return this.db
      .prepare('SELECT * FROM memories ORDER BY accessed_at DESC LIMIT ?')
      .all(limit) as MemoryEntry[];
  }

  getByType(type: string, limit = 10): MemoryEntry[] {
    return this.db
      .prepare(
        'SELECT * FROM memories WHERE type = ? ORDER BY importance DESC, accessed_at DESC LIMIT ?',
      )
      .all(type, limit) as MemoryEntry[];
  }

  getAll(): MemoryEntry[] {
    return this.db
      .prepare('SELECT * FROM memories ORDER BY accessed_at DESC')
      .all() as MemoryEntry[];
  }

  count(): number {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM memories').get() as {
      count: number;
    };
    return result.count;
  }

  delete(memoryId: string): void {
    this.db.prepare('DELETE FROM memories WHERE id = ?').run(memoryId);
  }
}
