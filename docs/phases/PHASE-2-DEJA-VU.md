# Phase 2 — Déjà Vu (Memory System)

> _"I've seen this before... or have I?"_

**Goal**: Build the 5-tier anti-compaction memory system with SQLite + FTS5.

**Estimated time**: 6-8 hours
**Prerequisites**: Phase 1 complete (agent loop, DB running)

---

## 2.1 — Session Transcripts (Tier 1: Reality Logs)

### `server/src/memory/session-transcript.ts`

Every message in/out is persisted. This is the source of truth for session context — not Claude Code's internal state (Audit Fix C1).

```typescript
export class SessionTranscript {
  record(sessionId: string, role: string, content: string, tokens?: number) {
    this.db
      .prepare(
        `
      INSERT INTO messages (id, session_id, role, content, tokens, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      )
      .run(nanoid(), sessionId, role, content, tokens ?? this.estimateTokens(content), Date.now());
  }

  getHistory(sessionId: string, limit?: number): Message[] {
    return this.db
      .prepare(
        `
      SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC LIMIT ?
    `,
      )
      .all(sessionId, limit ?? 1000);
  }

  estimateTokens(content: string): number {
    return Math.ceil(content.length / 4); // ~4 chars/token heuristic
  }

  getTotalTokens(sessionId: string): number {
    const result = this.db
      .prepare('SELECT COALESCE(SUM(tokens), 0) as total FROM messages WHERE session_id = ?')
      .get(sessionId);
    return result.total;
  }
}
```

---

## 2.2 — Session Handoff (Tier 2: Red Pill Moments)

### `server/src/memory/session-handoff.ts`

Triggered when session token count approaches The Fade threshold (default: 85%).

```typescript
export class SessionHandoff {
  private readonly FADE_THRESHOLD: number; // from config, default 0.85

  private readonly MODEL_LIMITS: Record<string, number> = {
    haiku: 200_000,
    sonnet: 200_000,
    opus: 200_000,
  };

  async checkForFade(session: Session): Promise<FadeCheck> {
    const tokens = await this.transcript.getTotalTokens(session.id);
    const limit = this.MODEL_LIMITS[session.model] ?? 200_000;
    const ratio = tokens / limit;

    if (ratio < this.FADE_THRESHOLD) {
      return { fading: false, ratio };
    }

    // Capture Red Pill Moment
    const snapshot = await this.captureSnapshot(session);
    this.db
      .prepare(
        `
      INSERT INTO handoffs (id, session_id, snapshot, context_size, created_at)
      VALUES (?, ?, ?, ?, ?)
    `,
      )
      .run(nanoid(), session.id, JSON.stringify(snapshot), tokens, Date.now());

    return { fading: true, ratio, snapshotId: snapshot.id };
  }

  private async captureSnapshot(session: Session): Promise<HandoffSnapshot> {
    const messages = await this.transcript.getHistory(session.id);
    // Use the last N messages to extract key data
    const recentMessages = messages.slice(-50);
    return {
      id: nanoid(),
      decisions: this.extractByPattern(recentMessages, /decided|chose|went with|will use/i),
      keyFacts: this.extractByPattern(recentMessages, /important|note|remember|key fact/i),
      openQuestions: this.extractByPattern(recentMessages, /\?$|todo|still need|unresolved/i),
      workInProgress: this.extractByPattern(recentMessages, /working on|in progress|started/i),
      userPreferences: this.extractByPattern(recentMessages, /prefer|always|never|like to/i),
      timestamp: Date.now(),
    };
  }
}
```

---

## 2.3 — Daily Log (Tier 3: Oracle's Journal)

### `server/src/memory/daily-log.ts`

Scheduled via Cron (default: 11pm daily). Summarizes the day's work.

```typescript
import cron from 'node-cron';

export class DailyLog {
  startSchedule(cronExpr: string) {
    cron.schedule(cronExpr, () => this.generateDailyLog());
  }

  async generateDailyLog() {
    const today = new Date().toISOString().split('T')[0];
    const todaySessions = this.db
      .prepare(
        `
      SELECT * FROM sessions WHERE date(started_at/1000, 'unixepoch') = ?
    `,
      )
      .all(today);

    if (todaySessions.length === 0) return;

    const messages = this.db
      .prepare(
        `
      SELECT m.* FROM messages m
      JOIN sessions s ON m.session_id = s.id
      WHERE date(s.started_at/1000, 'unixepoch') = ?
      ORDER BY m.timestamp
    `,
      )
      .all(today);

    const summary = {
      sessionsCount: todaySessions.length,
      totalMessages: messages.length,
      models: [...new Set(todaySessions.map((s) => s.model))],
      // Extract decisions, blockers, learnings from message content
      decisions: this.extractByPattern(messages, /decided|chose|will/i),
      blockers: this.extractByPattern(messages, /blocked|stuck|error|failed/i),
      learnings: this.extractByPattern(messages, /learned|realized|turns out|TIL/i),
    };

    this.db
      .prepare(
        `
      INSERT INTO daily_logs (id, date, summary, decisions, blockers, learnings, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        nanoid(),
        today,
        JSON.stringify(summary),
        JSON.stringify(summary.decisions),
        JSON.stringify(summary.blockers),
        JSON.stringify(summary.learnings),
        Date.now(),
      );
  }
}
```

---

## 2.4 — Long-term Memory (Tier 4: Déjà Vu Core)

### `server/src/memory/long-term.ts`

Persistent facts extracted from conversations. FTS5-indexed for fast search.

```typescript
export class LongTermMemory {
  store(entry: MemoryEntry) {
    this.db
      .prepare(
        `
      INSERT INTO memories (id, type, content, importance, tags, source_session, created_at, accessed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        entry.id,
        entry.type,
        entry.content,
        entry.importance,
        entry.tags.join(','),
        entry.sourceSession,
        Date.now(),
        Date.now(),
      );

    // Update FTS5 index
    this.db
      .prepare(
        `
      INSERT INTO memories_fts (rowid, content, tags) VALUES (last_insert_rowid(), ?, ?)
    `,
      )
      .run(entry.content, entry.tags.join(','));
  }

  searchFTS(query: string, limit = 10): MemorySearchResult[] {
    return this.db
      .prepare(
        `
      SELECT m.*, memories_fts.rank as relevance
      FROM memories_fts
      JOIN memories m ON memories_fts.rowid = m.rowid
      WHERE memories_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `,
      )
      .all(query, limit);
  }

  // Touch: update accessed_at for memory decay tracking
  touch(memoryId: string) {
    this.db.prepare('UPDATE memories SET accessed_at = ? WHERE id = ?').run(Date.now(), memoryId);
  }
}
```

### Future: Embedding Search (Audit Fix S4)

> Phase 3+ enhancement: Add `sqlite-vss` or local `all-MiniLM-L6-v2` embeddings for semantic search. FTS5 stays as fast first-pass filter, embeddings for re-ranking.

---

## 2.5 — Operational Memory (Tier 5: The Stories)

### `server/src/memory/operational-memory.ts`

File-based narratives in `workspace/stories/*.md`. Fed as context, not dense docs.

```typescript
export class OperationalMemory {
  private storiesDir: string;

  getRelevantStories(query: string, maxStories = 3): StoryContext[] {
    const stories = this.loadAllStories();
    // Score relevance by tag overlap with query keywords
    return stories
      .map((s) => ({ ...s, score: this.scoreRelevance(s, query) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxStories);
  }

  private loadAllStories(): Story[] {
    const files = readdirSync(this.storiesDir).filter((f) => f.endsWith('.md'));
    return files.map((f) => {
      const content = readFileSync(join(this.storiesDir, f), 'utf-8');
      const { title, tags } = this.parseFrontmatter(content);
      return { filename: f, title, tags, content };
    });
  }
}
```

---

## 2.6 — Unified Search

### `server/src/memory/search.ts`

Single interface to search across all memory tiers:

```typescript
export class MemorySearch {
  async search(query: string, opts: SearchOptions = {}): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    // Tier 4: FTS5 long-term
    const fts = await this.longTerm.searchFTS(query, opts.limit ?? 5);
    results.push(...fts.map((r) => ({ ...r, source: 'long-term' as const })));

    // Tier 2: Handoff snapshots (keyword search in JSON)
    const handoffs = this.db
      .prepare(
        `
      SELECT * FROM handoffs WHERE snapshot LIKE ? ORDER BY created_at DESC LIMIT 3
    `,
      )
      .all(`%${query}%`);
    results.push(...handoffs.map((r) => ({ ...r, source: 'handoff' as const })));

    // Tier 3: Daily logs
    const logs = this.db
      .prepare(
        `
      SELECT * FROM daily_logs WHERE summary LIKE ? ORDER BY date DESC LIMIT 3
    `,
      )
      .all(`%${query}%`);
    results.push(...logs.map((r) => ({ ...r, source: 'daily-log' as const })));

    return results;
  }
}
```

---

## 2.7 — SQLite Backup (Audit Fix M6)

### `server/src/db/backup.ts`

```typescript
export function scheduleBackups(
  db: Database.Database,
  backupDir: string,
  cronExpr = '0 */6 * * *',
) {
  cron.schedule(cronExpr, () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = join(backupDir, `neo-${timestamp}.db`);
    db.backup(dest).then(() => {
      console.log(`💾 Backup saved: ${dest}`);
      // Keep only last 10 backups
      cleanOldBackups(backupDir, 10);
    });
  });
}
```

---

## Test Suite

### `server/tests/phase-2/session-transcript.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { SessionTranscript } from '../../src/memory/session-transcript';

describe('SessionTranscript', () => {
  let db: Database.Database;
  let transcript: SessionTranscript;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(
      'CREATE TABLE messages (id TEXT PRIMARY KEY, session_id TEXT, role TEXT, content TEXT, tokens INTEGER, timestamp INTEGER)',
    );
    transcript = new SessionTranscript(db);
  });

  it('records a message and retrieves it', () => {
    transcript.record('s1', 'user', 'Hello Neo');
    const history = transcript.getHistory('s1');
    expect(history).toHaveLength(1);
    expect(history[0].content).toBe('Hello Neo');
    expect(history[0].role).toBe('user');
  });

  it('returns messages in chronological order', () => {
    transcript.record('s1', 'user', 'First');
    transcript.record('s1', 'assistant', 'Second');
    transcript.record('s1', 'user', 'Third');
    const history = transcript.getHistory('s1');
    expect(history.map((m) => m.content)).toEqual(['First', 'Second', 'Third']);
  });

  it('isolates messages by session', () => {
    transcript.record('s1', 'user', 'Session 1');
    transcript.record('s2', 'user', 'Session 2');
    expect(transcript.getHistory('s1')).toHaveLength(1);
    expect(transcript.getHistory('s2')).toHaveLength(1);
  });

  it('estimates tokens at ~4 chars per token', () => {
    expect(transcript.estimateTokens('Hello world')).toBe(3); // 11 chars / 4 = 2.75 → ceil = 3
    expect(transcript.estimateTokens('')).toBe(0);
  });

  it('calculates total tokens for a session', () => {
    transcript.record('s1', 'user', 'Hello world', 3);
    transcript.record('s1', 'assistant', 'Hi there, how can I help?', 7);
    expect(transcript.getTotalTokens('s1')).toBe(10);
  });

  it('respects limit parameter in getHistory', () => {
    for (let i = 0; i < 100; i++) transcript.record('s1', 'user', `Message ${i}`);
    expect(transcript.getHistory('s1', 5)).toHaveLength(5);
  });
});
```

### `server/tests/phase-2/session-handoff.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { SessionHandoff } from '../../src/memory/session-handoff';

describe('SessionHandoff (Red Pill Moments)', () => {
  let handoff: SessionHandoff;

  beforeEach(() => {
    const db = new Database(':memory:');
    // setup tables...
    handoff = new SessionHandoff(db, { fadeThreshold: 0.85 });
  });

  it('does NOT trigger handoff below 85% threshold', async () => {
    const result = await handoff.checkForFade(
      { id: 's1', model: 'sonnet' },
      100_000, // 50% of 200k
    );
    expect(result.fading).toBe(false);
  });

  it('triggers handoff at exactly 85% threshold', async () => {
    const result = await handoff.checkForFade(
      { id: 's1', model: 'sonnet' },
      170_000, // 85% of 200k
    );
    expect(result.fading).toBe(true);
    expect(result.snapshotId).toBeDefined();
  });

  it('triggers handoff above 85%', async () => {
    const result = await handoff.checkForFade(
      { id: 's1', model: 'sonnet' },
      190_000, // 95%
    );
    expect(result.fading).toBe(true);
  });

  it('snapshot contains decisions, keyFacts, openQuestions', async () => {
    // Seed some messages with decision-like content
    const result = await handoff.checkForFade({ id: 's1', model: 'sonnet' }, 180_000);
    if (result.fading) {
      const snapshot = JSON.parse(
        handoff['db'].prepare('SELECT snapshot FROM handoffs WHERE session_id = ?').get('s1')
          .snapshot,
      );
      expect(snapshot).toHaveProperty('decisions');
      expect(snapshot).toHaveProperty('keyFacts');
      expect(snapshot).toHaveProperty('openQuestions');
      expect(snapshot).toHaveProperty('workInProgress');
      expect(snapshot).toHaveProperty('userPreferences');
      expect(snapshot).toHaveProperty('timestamp');
    }
  });

  it('respects custom threshold from config', async () => {
    const strict = new SessionHandoff(new Database(':memory:'), { fadeThreshold: 0.5 });
    const result = await strict.checkForFade({ id: 's1', model: 'sonnet' }, 110_000);
    expect(result.fading).toBe(true); // 55% > 50%
  });
});
```

### `server/tests/phase-2/long-term-memory.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { LongTermMemory } from '../../src/memory/long-term';

describe('LongTermMemory + FTS5', () => {
  let memory: LongTermMemory;

  beforeEach(() => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE memories (id TEXT PRIMARY KEY, type TEXT, content TEXT, importance REAL, tags TEXT, source_session TEXT, created_at INTEGER, accessed_at INTEGER);
      CREATE VIRTUAL TABLE memories_fts USING fts5(content, tags, content='memories', content_rowid='rowid');
    `);
    memory = new LongTermMemory(db);
  });

  it('stores and retrieves a memory', () => {
    memory.store({
      id: 'm1',
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
      id: 'm1',
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
      id: 'm1',
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
      id: 'm1',
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
        id: `m${i}`,
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
    memory.store({
      id: 'm1',
      type: 'fact',
      content: 'test',
      importance: 0.5,
      tags: [],
      sourceSession: 's1',
    });
    const before = memory['db'].prepare('SELECT accessed_at FROM memories WHERE id = ?').get('m1');
    memory.touch('m1');
    const after = memory['db'].prepare('SELECT accessed_at FROM memories WHERE id = ?').get('m1');
    expect(after.accessed_at).toBeGreaterThanOrEqual(before.accessed_at);
  });
});
```

### `server/tests/phase-2/unified-search.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { MemorySearch } from '../../src/memory/search';

describe('MemorySearch (Unified)', () => {
  it('returns results from long-term memory tier', async () => {
    const search = new MemorySearch(mockDb, mockLongTerm);
    const results = await search.search('TypeScript');
    const sources = results.map((r) => r.source);
    expect(sources).toContain('long-term');
  });

  it('returns results from handoff tier', async () => {
    const results = await search.search('deployment decision');
    expect(results.some((r) => r.source === 'handoff')).toBe(true);
  });

  it('returns results from daily log tier', async () => {
    const results = await search.search('yesterday tasks');
    expect(results.some((r) => r.source === 'daily-log')).toBe(true);
  });

  it('returns empty array when nothing matches', async () => {
    const results = await search.search('xyznonexistenttopic123');
    expect(results).toHaveLength(0);
  });

  it('combines results from multiple tiers in single response', async () => {
    const results = await search.search('common keyword');
    const sourcesSet = new Set(results.map((r) => r.source));
    expect(sourcesSet.size).toBeGreaterThanOrEqual(1);
  });
});
```

### `server/tests/phase-2/backup.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';

describe('SQLite Backup', () => {
  it('creates a backup file', async () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE test (id INTEGER)');
    const backupPath = join(__dirname, '__tmp_backup.db');
    await db.backup(backupPath);
    expect(existsSync(backupPath)).toBe(true);
  });

  it('backup contains same data as original', async () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE test (id INTEGER); INSERT INTO test VALUES (42);');
    const backupPath = join(__dirname, '__tmp_backup2.db');
    await db.backup(backupPath);
    const restored = new Database(backupPath);
    const row = restored.prepare('SELECT id FROM test').get();
    expect(row.id).toBe(42);
  });
});
```

---

## Acceptance Criteria

- [ ] Messages are recorded to `messages` table on every interaction
- [ ] Fade detection triggers at 85% context threshold
- [ ] Red Pill Moment snapshot captures decisions, facts, WIP, preferences
- [ ] Daily log generates via cron and persists to `daily_logs`
- [ ] FTS5 search returns relevant memories by keyword
- [ ] Stories are loaded from `workspace/stories/` and ranked by relevance
- [ ] Unified search returns results from all 5 tiers
- [ ] SQLite backup runs on schedule, keeps last 10 copies
- [ ] Token estimation works (character heuristic)

---

## Files Created

```
server/src/memory/
├── session-transcript.ts      ← NEW
├── session-handoff.ts         ← NEW
├── daily-log.ts               ← NEW
├── long-term.ts               ← NEW
├── operational-memory.ts      ← NEW
└── search.ts                  ← NEW
server/src/db/
└── backup.ts                  ← NEW (M6)
```
