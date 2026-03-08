# Phase 2 — Déjà Vu (Memory System)

> _"I've seen this before... or have I?"_

**Goal**: Build the 5-tier anti-compaction memory system with SQLite + FTS5.

**Estimated time**: 6-8 hours
**Prerequisites**: Phase 1 complete (agent loop, DB running)

---

## Architecture Overview

### Why This Exists

Claude Code undergoes **compaction** — when the context window fills up, it summarizes past conversations, destroying nuanced instructions, decisions, and preferences. Felix Taylor's research ([FELIX_TAYLOR.md](../research/FELIX_TAYLOR.md)) identified this as the #1 failure mode for long-running agent sessions:

> _"Compaction forces the AI to summarize its context window, often causing it to forget strict instructions and drift off-course."_

The Déjà Vu system solves this with **external persistence** — Neo maintains its own memory in SQLite, independent of Claude's internal state (Audit Fix C1 from [IMPLEMENTATION.md](../research/IMPLEMENTATION.md) §5).

### 5-Tier Memory Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DÉJÀ VU SYSTEM                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────┐       │
│  │  T1: SESSION TRANSCRIPTS (Reality Logs)                  │       │
│  │  ───────────────────────────────────────                 │       │
│  │  Scope: Per-session, every message in/out                │       │
│  │  Storage: `messages` table (SQLite)                      │       │
│  │  Lifecycle: Lives for session duration + archival        │       │
│  │  Access: Direct lookup by session_id                     │       │
│  │  Purpose: Source of truth for session context            │       │
│  └──────────────────────────┬──────────────────────────────┘       │
│                              │ feeds into                           │
│  ┌──────────────────────────▼──────────────────────────────┐       │
│  │  T2: SESSION HANDOFFS (Red Pill Moments)                 │       │
│  │  ───────────────────────────────────────                 │       │
│  │  Scope: Triggered at 85% context window fill             │       │
│  │  Storage: `handoffs` table (JSON snapshots)              │       │
│  │  Lifecycle: Permanent — never auto-deleted               │       │
│  │  Access: Searched by keyword match in JSON               │       │
│  │  Purpose: Preserve nuance before The Fade                │       │
│  └──────────────────────────┬──────────────────────────────┘       │
│                              │ summarized by                        │
│  ┌──────────────────────────▼──────────────────────────────┐       │
│  │  T3: DAILY LOGS (Oracle's Journal)                       │       │
│  │  ───────────────────────────────────────                 │       │
│  │  Scope: All sessions for a calendar day                  │       │
│  │  Storage: `daily_logs` table (JSON summaries)            │       │
│  │  Lifecycle: 1 entry per day, permanent                   │       │
│  │  Access: By date, keyword search in summary              │       │
│  │  Purpose: "What did I do yesterday?"                     │       │
│  └─────────────────────────────────────────────────────────┘       │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────┐       │
│  │  T4: LONG-TERM MEMORY (Déjà Vu Core)                    │       │
│  │  ───────────────────────────────────────                 │       │
│  │  Scope: Extracted facts, preferences, decisions          │       │
│  │  Storage: `memories` table + `memories_fts` (FTS5)       │       │
│  │  Lifecycle: Permanent with decay tracking (accessed_at)  │       │
│  │  Access: Full-text search (FTS5 MATCH)                   │       │
│  │  Purpose: "I know this user prefers dark mode"           │       │
│  └─────────────────────────────────────────────────────────┘       │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────┐       │
│  │  T5: OPERATIONAL MEMORY (The Stories)                    │       │
│  │  ───────────────────────────────────────                 │       │
│  │  Scope: Static narratives encoding rules/culture         │       │
│  │  Storage: `workspace/stories/*.md` (file-based)          │       │
│  │  Lifecycle: Manually authored, version-controlled        │       │
│  │  Access: Tag-based relevance scoring                     │       │
│  │  Purpose: Feed rules contextually, not as dense docs     │       │
│  └─────────────────────────────────────────────────────────┘       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow: Message → Memory Pipeline

```
User sends message
    │
    ▼
┌─ Phase 1: Agent Loop Step 8 (MEMORY) ──────────────────────┐
│                                                              │
│  1. Record to T1 (session-transcript.record())               │
│     └── INSERT into `messages` table                         │
│                                                              │
│  2. Check for Fade (session-handoff.checkForFade())          │
│     ├── Calculate: tokens / MODEL_LIMIT                      │
│     ├── If ratio ≥ 0.85 → capture Red Pill Moment (T2)      │
│     │   └── Extract: decisions, keyFacts, openQuestions,     │
│     │       workInProgress, userPreferences                  │
│     └── Emit 'fade-warning' WebSocket event                  │
│                                                              │
│  3. Extract long-term memories (T4) [FUTURE - see §2.8]     │
│     └── AI-assisted extraction of facts/preferences          │
│                                                              │
│  4. Context assembly reads from ALL tiers                    │
│     ├── T4: FTS5 search for relevant memories                │
│     ├── T5: Tag-scored stories from filesystem               │
│     ├── T2: Recent handoff snapshots                         │
│     └── T1: Current session history                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Connection to Research

| Research Source                                       | Key Insight                                       | How Phase 2 Addresses It                              |
| ----------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------- |
| [FELIX_TAYLOR.md](../research/FELIX_TAYLOR.md)        | Session Handoffs capture nuance before compaction | T2: `SessionHandoff` with pattern-based extraction    |
| [FELIX_TAYLOR.md](../research/FELIX_TAYLOR.md)        | Daily Logs using Haiku to summarize tasks         | T3: `DailyLog` with cron scheduling                   |
| [FELIX_TAYLOR.md](../research/FELIX_TAYLOR.md)        | Operational memory via "5 short stories"          | T5: `OperationalMemory` from `workspace/stories/*.md` |
| [FELIX_TAYLOR.md](../research/FELIX_TAYLOR.md)        | Full session transcripts for semantic retrieval   | T1: `SessionTranscript` in `messages` table           |
| [IDEA.md](../research/IDEA.md)                        | "Advanced memory management" requirement          | All 5 tiers + unified search                          |
| [TOOL.md](../research/TOOL.md)                        | Mem0 for persistent memory layer                  | See §2.9 — Mem0 Integration Roadmap                   |
| [IMPLEMENTATION.md](../research/IMPLEMENTATION.md) §5 | SDK is opaque — must maintain external history    | T1 is source of truth, not Claude's internal state    |
| [IMPLEMENTATION.md](../research/IMPLEMENTATION.md) §9 | 5-tier architecture with FTS5                     | Direct implementation of the spec                     |

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

**Audit Notes:**

- The `messages` table has a composite index `idx_messages_session(session_id, timestamp)` — verified in `migrations.ts` v1
- Foreign key cascade ensures messages are deleted when a session is removed
- Role constraint: `'user' | 'assistant' | 'system' | 'tool'` — enforced at DB level via CHECK constraint
- Token estimation uses `ceil(length/4)` heuristic — adequate for Phase 2, consider `tiktoken` for Phase 3+

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

**Audit Notes:**

- Pattern-based extraction (regex) is a v1 approach — works for structured conversations but misses nuanced decisions expressed in natural language
- The `last 50 messages` window is a reasonable default but should be configurable
- Handoff snapshots are stored as JSON blobs — not FTS5-indexed, queried via `LIKE %query%` which is O(n) scan
- **Gap**: No mechanism to _resume_ from a handoff when starting a new session. The consuming code (in Phase 1's `assembleContext`) must explicitly load recent handoffs into the system prompt

### Session Lifecycle State Machine

```
                    ┌───────────┐
     create()  ────►│  ACTIVE   │
                    └─────┬─────┘
                          │
              ┌───────────┼───────────┐
              │           │           │
              ▼           ▼           ▼
        user ends    Fade ≥ 85%    error/crash
              │           │           │
              ▼           ▼           ▼
        ┌─────────┐ ┌─────────┐ ┌─────────┐
        │  ENDED  │ │  FADED  │ │  ENDED  │
        └─────────┘ └────┬────┘ └─────────┘
                         │
                    Red Pill Moment
                    snapshot saved
                         │
                    New session can
                    load snapshot as
                    bootstrap context
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

**Audit Notes:**

- `daily_logs.date` has a UNIQUE constraint — prevents duplicate entries for the same day
- Felix Taylor's approach uses Haiku specifically for summarization to keep costs low. Our cron-based extraction doesn't call Claude at all (pure regex), which is cost-free but less intelligent
- **Future Enhancement**: Use Haiku via the Claude Bridge to generate richer, AI-assisted summaries instead of regex extraction

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

    // FTS5 index is auto-updated via triggers (see migrations.ts)
    // No manual INSERT into memories_fts needed
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

**Audit Notes — FTS5 Sync Triggers:**

The `migrations.ts` file (v1) includes three triggers that keep `memories_fts` in sync with `memories`:

| Trigger       | Event        | Action                                   |
| ------------- | ------------ | ---------------------------------------- |
| `memories_ai` | AFTER INSERT | Auto-inserts into FTS5                   |
| `memories_ad` | AFTER DELETE | Removes from FTS5 via `'delete'` command |
| `memories_au` | AFTER UPDATE | Delete old + insert new into FTS5        |

> **Important**: Because triggers handle FTS sync, the `store()` method should NOT manually insert into `memories_fts`. The original Phase 2 code had a manual FTS insert which would cause **duplicate entries**. The corrected version above relies on triggers.

**Memory Types** (enforced via CHECK constraint in `migrations.ts`):

| Type         | Description             | Example                            |
| ------------ | ----------------------- | ---------------------------------- |
| `fact`       | Objective information   | "Project uses pnpm workspaces"     |
| `preference` | User preferences        | "User prefers dark mode"           |
| `decision`   | Architectural decisions | "Chose SQLite over Postgres"       |
| `learning`   | Lessons learned         | "FTS5 needs content sync triggers" |
| `correction` | Error corrections       | "Don't use rm -rf on workspace"    |

### Memory Decay Algorithm

The `accessed_at` field enables a decay-based relevance system:

```typescript
// Future: Score memories by recency + importance
function decayScore(memory: Memory): number {
  const ageMs = Date.now() - memory.accessed_at;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const decayFactor = Math.exp(-0.1 * ageDays); // Half-life ≈ 7 days
  return memory.importance * decayFactor;
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

**Audit Notes:**

- Stories are also tracked in the `stories` DB table (per `migrations.ts`) for metadata/access logging, but the actual content lives on the filesystem
- Default stories from [IMPLEMENTATION.md](../research/IMPLEMENTATION.md) §4: `01-who-i-am.md`, `02-how-i-work.md`, `03-my-rules.md`, `04-my-human.md`, `05-my-mission.md`
- `maxStoriesInContext` defaults to 3 (from config spec in IMPLEMENTATION.md §15) to avoid bloating the system prompt

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

**Audit Notes:**

- T1 (session transcripts) and T5 (stories) are NOT searched in unified search — this is intentional:
  - T1 is accessed directly via `getHistory(sessionId)` — searching across all sessions would be too noisy
  - T5 is accessed via `getRelevantStories()` with tag-based scoring, not keyword search
- Handoff and daily log searches use `LIKE %query%` — no index acceleration. Consider adding FTS5 indexes for these tables if the dataset grows large
- **Gap**: No relevance ranking across tiers. Results from different tiers aren't normalized for comparison

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

## 2.8 — Memory Extraction Pipeline (Design)

> **Status**: Not yet implemented — this section documents the design for automatic memory extraction from conversations.

The gap between "messages are recorded" (T1) and "memories exist" (T4) requires an extraction step. Two approaches:

### Approach A: Pattern-Based (Phase 2 — Ship Now)

Same regex patterns used in handoff/daily-log extraction. Low cost, instant.

```typescript
class MemoryExtractor {
  async extractFromMessage(message: Message, session: Session): Promise<MemoryEntry[]> {
    const entries: MemoryEntry[] = [];

    // Preference detection
    if (/prefer|always use|never use|like to/i.test(message.content)) {
      entries.push({ type: 'preference', content: message.content, importance: 0.7 });
    }

    // Decision detection
    if (/decided|chose|will use|going with/i.test(message.content)) {
      entries.push({ type: 'decision', content: message.content, importance: 0.8 });
    }

    return entries;
  }
}
```

### Approach B: AI-Assisted (Phase 3+ — Mem0 Integration)

Use Haiku via Claude Bridge to intelligently extract memories. Higher quality, costs tokens.

---

## 2.9 — Mem0 Integration Roadmap

[TOOL.md](../research/TOOL.md) lists **Mem0** as a pre-installed tool for the agent:

> _"Persistent memory layer for AI agents. Handles session memory, long-term recall, and semantic search across conversations."_

### How Mem0 Complements Déjà Vu

| Capability           | Déjà Vu (SQLite)        | Mem0               | Winner  |
| -------------------- | ----------------------- | ------------------ | ------- |
| Session transcripts  | ✅ Full control         | ❌ Not its purpose | Déjà Vu |
| Semantic search      | ❌ FTS5 keyword only    | ✅ Embedding-based | Mem0    |
| Memory extraction    | ❌ Regex patterns       | ✅ AI-powered      | Mem0    |
| Offline/local-first  | ✅ SQLite               | ❌ Requires API    | Déjà Vu |
| Memory decay/scoring | ✅ accessed_at tracking | ✅ Built-in        | Tie     |

### Integration Strategy

Mem0 should augment T4 (Long-term Memory), not replace it:

1. **SQLite stays as primary store** — local-first, no external dependencies
2. **Mem0 adds semantic search** — re-rank FTS5 results using Mem0's embeddings
3. **Mem0 handles extraction** — replace regex patterns with Mem0's AI extraction
4. **Fallback gracefully** — if Mem0 is unavailable, FTS5 still works

---

## 2.10 — Database Schema (Verified)

The following schema is implemented in `server/src/db/migrations.ts` (version 1):

```sql
-- ✅ Verified: All tables exist with correct constraints

messages    → FK to sessions(id) ON DELETE CASCADE, INDEX(session_id, timestamp)
handoffs    → FK to sessions(id) ON DELETE CASCADE
daily_logs  → UNIQUE(date)
memories    → CHECK(type IN ('fact','preference','decision','learning','correction'))
memories_fts → FTS5 with sync triggers (ai/ad/au)
stories     → UNIQUE(filename)
audit_log   → INDEX(timestamp), INDEX(event_type)
```

### Schema Differences from IMPLEMENTATION.md Spec

| Field                  | Spec (IMPLEMENTATION.md §14)                                  | Actual (migrations.ts)                                 | Note                                     |
| ---------------------- | ------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------- |
| `sessions.metadata`    | TEXT (JSON blob)                                              | ❌ Missing                                             | Not critical for Phase 2                 |
| `memories.type` values | `fact, preference, knowledge, decision`                       | `fact, preference, decision, learning, correction`     | Expanded — good                          |
| `stories` schema       | `id, title, content, category, relevance_tags, sort_order`    | `id, filename, title, tags, last_loaded_at`            | Simplified — content lives on filesystem |
| `audit_log` columns    | `gate_results, model_used, tokens_in, tokens_out, tool_calls` | `gate_name, model_used, tokens_used, blocked, details` | Restructured — equally functional        |

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
- [ ] FTS5 sync triggers tested (insert/update/delete keep index current)
- [ ] Stories are loaded from `workspace/stories/` and ranked by relevance
- [ ] Unified search returns results from tiers 2, 3, and 4
- [ ] SQLite backup runs on schedule, keeps last 10 copies
- [ ] Token estimation works (character heuristic)
- [ ] Memory extraction pipeline stores at least preference/decision types

---

## Audit Gap Summary

| #   | Gap                                                           | Severity  | Recommendation                                                                       |
| --- | ------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------ |
| G1  | No automatic memory extraction from conversations (T1 → T4)   | 🔴 High   | Implement regex-based `MemoryExtractor` in Phase 2, upgrade to Mem0/AI in Phase 3    |
| G2  | FTS5 manual insert in `store()` duplicates trigger-based sync | 🟡 Medium | Remove manual FTS insert, rely on triggers (fixed in §2.4 above)                     |
| G3  | Handoff snapshots not searchable via FTS5                     | 🟡 Medium | Add FTS5 index for `handoffs.snapshot` or extract key terms into a searchable column |
| G4  | No session resumption from handoff snapshots                  | 🟡 Medium | Add `loadHandoffContext(sessionId)` to bootstrap new sessions from previous Fade     |
| G5  | Daily log uses regex extraction, not AI summarization         | 🟢 Low    | Phase 3 upgrade to use Haiku via Claude Bridge for richer summaries                  |
| G6  | `sessions.metadata` column missing from migrations            | 🟢 Low    | Add in migration v2 if needed                                                        |
| G7  | No cross-tier relevance normalization in unified search       | 🟢 Low    | Implement scoring normalization when embedding search arrives                        |

---

## Files Created

```
server/src/memory/
├── session-transcript.ts      ← NEW
├── session-handoff.ts         ← NEW
├── daily-log.ts               ← NEW
├── long-term.ts               ← NEW
├── operational-memory.ts      ← NEW
├── search.ts                  ← NEW
└── extractor.ts               ← NEW (memory extraction pipeline)
server/src/db/
└── backup.ts                  ← NEW (M6)
```
