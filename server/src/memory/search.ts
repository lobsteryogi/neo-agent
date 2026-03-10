/**
 * ░▒▓ MEMORY SEARCH ▓▒░ (Unified Search)
 *
 * "I can see the code now..."
 *
 * Single interface to search across memory tiers 2, 3, and 4.
 * T1 (transcripts) and T5 (stories) have their own access patterns.
 */

import type { MemorySearchResult } from '@neo-agent/shared';
import type Database from 'better-sqlite3';
import { LongTermMemory } from './long-term.js';

export interface UnifiedSearchResult {
  content: string;
  source: 'long-term' | 'handoff' | 'daily-log';
  relevance?: number;
  metadata?: Record<string, unknown>;
}

export interface SearchOptions {
  limit?: number;
  sources?: ('long-term' | 'handoff' | 'daily-log')[];
}

export class MemorySearch {
  private longTerm: LongTermMemory;

  constructor(private db: Database.Database) {
    this.longTerm = new LongTermMemory(db);
  }

  search(query: string, opts: SearchOptions = {}): UnifiedSearchResult[] {
    const results: UnifiedSearchResult[] = [];
    const sources = opts.sources ?? ['long-term', 'handoff', 'daily-log'];
    const limit = opts.limit ?? 5;

    // Tier 4: FTS5 long-term memories
    if (sources.includes('long-term')) {
      const fts = this.longTerm.searchFTS(query, limit);
      // Batch touch for decay tracking (single UPDATE instead of N)
      if (fts.length > 0) {
        this.longTerm.touchBulk(fts.map((r) => r.id));
      }
      for (const r of fts) {
        results.push({
          content: r.content,
          source: 'long-term',
          relevance: r.relevance,
          metadata: { type: r.type, importance: r.importance, tags: r.tags },
        });
      }
    }

    // Tier 2: Handoff snapshots (keyword search in JSON)
    if (sources.includes('handoff')) {
      const handoffs = this.db
        .prepare(
          `SELECT snapshot, created_at FROM handoffs
           WHERE snapshot LIKE ?
           ORDER BY created_at DESC LIMIT ?`,
        )
        .all(`%${query}%`, Math.min(limit, 3)) as { snapshot: string; created_at: number }[];

      for (const h of handoffs) {
        results.push({
          content: h.snapshot,
          source: 'handoff',
          metadata: { created_at: h.created_at },
        });
      }
    }

    // Tier 3: Daily logs
    if (sources.includes('daily-log')) {
      const logs = this.db
        .prepare(
          `SELECT date, summary, decisions, blockers, learnings FROM daily_logs
           WHERE summary LIKE ? OR decisions LIKE ? OR learnings LIKE ?
           ORDER BY date DESC LIMIT ?`,
        )
        .all(`%${query}%`, `%${query}%`, `%${query}%`, Math.min(limit, 3)) as any[];

      for (const l of logs) {
        results.push({
          content: l.summary,
          source: 'daily-log',
          metadata: { date: l.date },
        });
      }
    }

    return results;
  }
}
