# Phase 0 — Wake Up, Neo (Project Scaffold + Onboard Wizard)

> _"The Matrix has you... Follow the white rabbit. 🐇"_

**Goal**: Initialize the monorepo, install dependencies, and build the interactive onboard wizard that generates all configuration files.

**Estimated time**: 4-6 hours
**Prerequisites**: Node.js ≥22, pnpm 9.x, Claude Code CLI installed

---

## 0.1 — Scaffold the Monorepo

### Create workspace root

```bash
mkdir -p server/src dashboard/src packages/shared/src
pnpm init
```

### `pnpm-workspace.yaml`

```yaml
packages:
  - 'server'
  - 'dashboard'
  - 'packages/*'
```

### Root `package.json` scripts

```json
{
  "name": "neo-agent",
  "private": true,
  "scripts": {
    "neo:onboard": "pnpm --filter server run onboard",
    "neo:start": "pnpm --filter server run start",
    "neo:dev": "pnpm --filter server run dev",
    "dashboard:dev": "pnpm --filter dashboard run dev",
    "test": "pnpm -r run test"
  }
}
```

### `tsconfig.json` (base)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

### Shared types package — `packages/shared/` (Audit Fix M1)

```typescript
// packages/shared/src/index.ts
// All shared interfaces live here — imported by both server and dashboard

export interface Session {
  id: string;
  channel: 'telegram' | 'web' | 'cli';
  userId?: string;
  model: string;
  status: 'active' | 'ended' | 'faded';
  startedAt: number;
  endedAt?: number;
  totalTokens: number;
}

export interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tokens: number;
  timestamp: number;
}

export interface GateVerdict {
  blocked: boolean;
  reason?: string;
  neoQuip?: string;
  confidence?: number;
  pendingAction?: PlannedAction[];
}

export interface GuardrailVerdict {
  blocked: boolean;
  reason?: string;
  confidence?: number;
  sanitized?: InboundMessage;
}

export interface HealthStatus {
  status: 'operational' | 'degraded' | 'down';
  claude: { responsive: boolean; lastLatencyMs?: number };
  memory: { dbSizeMb: number; ftsEntries: number };
  activeSession?: { tokensUsed: number; fadeRisk: number };
  gates: { blockedLast1h: number };
  sync: { lastSyncAt?: string; behind: boolean };
  tools: Record<string, { available: boolean; degraded?: string }>;
}

// ... more types as needed
```

### Server dependencies

```bash
cd server && pnpm add \
  express \
  ws \
  better-sqlite3 \
  @anthropic-ai/claude-code \
  @clack/prompts \
  @composio/core \
  node-cron \
  dotenv \
  nanoid \
  zod

pnpm add -D \
  typescript \
  tsup \
  @types/express \
  @types/ws \
  @types/better-sqlite3 \
  @types/node-cron \
  @types/node \
  vitest
```

---

## 0.2 — Claude Code SDK Proof-of-Concept (Audit Fix C1)

**Before building anything else**, validate what the SDK actually exposes:

### `server/src/poc/sdk-test.ts`

```typescript
import { claude } from '@anthropic-ai/claude-code';

async function testSDK() {
  console.log('🧪 Testing Claude Code SDK capabilities...\n');

  const result = await claude({
    prompt: 'What is 2 + 2? Reply in one word.',
    cwd: process.cwd(),
    permissionMode: 'default',
    maxTurns: 1,
    onMessage: (event) => {
      console.log('📨 Event type:', event.type);
      console.log('   Keys:', Object.keys(event));
      if ('content' in event)
        console.log('   Content preview:', String(event.content).slice(0, 100));
      if ('usage' in event) console.log('   Usage:', event.usage);
      console.log('');
    },
  });

  console.log('\n✅ Final result type:', typeof result);
  console.log('   Result keys:', Object.keys(result));
  console.log('   Full result:', JSON.stringify(result, null, 2).slice(0, 2000));
}

testSDK().catch(console.error);
```

### What to validate

| Question                                     | Test                                  |
| -------------------------------------------- | ------------------------------------- |
| Does `onMessage` fire per token or per turn? | Check event frequency                 |
| What event types exist?                      | Log `event.type` values               |
| Is token usage available per turn?           | Check for `usage` field               |
| Can we get tool call details?                | Send a prompt that triggers file read |
| What does the final result contain?          | Log full result object                |

### If SDK is insufficient — Fallback

```typescript
// Fallback: parse claude CLI JSON output directly
import { execFile } from 'child_process';

async function claudeFallback(prompt: string) {
  return new Promise((resolve, reject) => {
    const proc = execFile(
      'claude',
      ['-p', prompt, '--output-format', 'json'],
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(err);
        resolve(JSON.parse(stdout));
      },
    );
  });
}
```

---

## 0.3 — Onboard Wizard ("Wake Up, Neo")

### `server/src/onboard/wizard.ts`

Two paths:

- **Blue Pill** (3 steps — Audit Fix S5): name → verify Claude CLI → done with defaults
- **Red Pill** (full): all 11 steps for power users

```typescript
import * as clack from '@clack/prompts';

export async function runWizard() {
  clack.intro('░▒▓ WAKE UP, NEO ▓▒░');
  console.log('The Matrix has you...\n');

  // Step 1: The Choice
  const pill = await clack.select({
    message: 'Choose your path:',
    options: [
      { value: 'blue', label: '💊 Blue Pill — Quick setup (3 steps, sensible defaults)' },
      { value: 'red', label: '💊 Red Pill — Full configuration (11 steps, total control)' },
    ],
  });

  if (clack.isCancel(pill)) return process.exit(0);

  if (pill === 'blue') {
    await runBluePill();
  } else {
    await runRedPill();
  }

  clack.outro('Welcome to the real world. 🕶️');
}

async function runBluePill() {
  // Step 1: Your name
  const userName = await clack.text({ message: 'What should I call you?' });
  // Step 2: Verify Claude CLI
  await verifyClaude();
  // Step 3: Generate everything with defaults
  await generateConfig({ userName, ...DEFAULTS });
  await initDatabase();
  await writeWorkspaceFiles();
}
```

### Wizard step files

| File                      | Step          | What it does                                                        |
| ------------------------- | ------------- | ------------------------------------------------------------------- |
| `steps/01-choice.ts`      | The Choice    | Red/Blue pill selector                                              |
| `steps/02-identity.ts`    | Identity      | Agent name, user name, personality intensity                        |
| `steps/03-claude-link.ts` | Claude Link   | Verify `claude` CLI is installed + authenticated                    |
| `steps/04-construct.ts`   | The Construct | Dashboard/CLI/both, port config                                     |
| `steps/05-phone-lines.ts` | Phone Lines   | Composio API key, Telegram bot token                                |
| `steps/06-free-will.ts`   | Free Will     | Gate phrase, protected paths, permission mode                       |
| `steps/07-deja-vu.ts`     | Déjà Vu       | Fade threshold, daily log time, story count                         |
| `steps/08-dodge-this.ts`  | Dodge This    | Default routing profile                                             |
| `steps/09-matrix-sync.ts` | Matrix Sync   | Git repo URL, Tailscale toggle                                      |
| `steps/10-kung-fu.ts`     | Kung Fu       | Scan workspace for skills, install defaults                         |
| `steps/11-awakening.ts`   | Awakening     | Generate `.env`, init DB, write AGENTS.md + SOUL.md, run first test |

### Generated files

The wizard produces:

1. `.env` — All secrets and config values
2. `workspace/AGENTS.md` — Operating instructions
3. `workspace/SOUL.md` — Neo's identity/persona
4. `workspace/TOOLS.md` — Tool usage notes
5. `workspace/stories/` — Default operational stories (5 files)
6. `neo.db` — Initialized SQLite database with schema
7. `workspace/.claude/settings.json` — Permission rules

---

## 0.4 — Database Schema Init (Audit Fix M2: Versioned Migrations)

### `server/src/db/connection.ts`

```typescript
import Database from 'better-sqlite3';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(process.env.NEO_DB_PATH || 'neo.db');
    db.pragma('journal_mode = WAL'); // Better concurrent read perf
    db.pragma('foreign_keys = ON');
    runMigrations(db);
  }
  return db;
}
```

### `server/src/db/migrations.ts` (Audit Fix M2)

```typescript
const MIGRATIONS = [
  {
    version: 1,
    name: 'initial_schema',
    up: `
      CREATE TABLE IF NOT EXISTS _migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      );
      CREATE TABLE sessions (...);
      CREATE TABLE messages (...);
      CREATE TABLE handoffs (...);
      CREATE TABLE daily_logs (...);
      CREATE TABLE memories (...);
      CREATE VIRTUAL TABLE memories_fts USING fts5(...);
      CREATE TABLE stories (...);
      CREATE TABLE audit_log (...);
      CREATE TABLE gate_config (...);
      CREATE TABLE sibling_locks (...);
    `,
  },
];

export function runMigrations(db: Database.Database) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, name TEXT, applied_at INTEGER)',
  );
  const applied = db
    .prepare('SELECT version FROM _migrations')
    .all()
    .map((r) => r.version);

  for (const migration of MIGRATIONS) {
    if (!applied.includes(migration.version)) {
      db.exec(migration.up);
      db.prepare('INSERT INTO _migrations VALUES (?, ?, ?)').run(
        migration.version,
        migration.name,
        Date.now(),
      );
      console.log(`✅ Migration ${migration.version}: ${migration.name}`);
    }
  }
}
```

---

## Test Suite

### `server/tests/phase-0/migrations.test.ts` — Database Migrations

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/migrations';

describe('Database Migrations', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
  });

  it('creates _migrations table on first run', () => {
    runMigrations(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'")
      .get();
    expect(tables).toBeTruthy();
  });

  it('creates all required tables from migration v1', () => {
    runMigrations(db);
    const required = [
      'sessions',
      'messages',
      'handoffs',
      'daily_logs',
      'memories',
      'stories',
      'audit_log',
      'gate_config',
      'sibling_locks',
    ];
    for (const table of required) {
      const exists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(table);
      expect(exists, `Table '${table}' should exist`).toBeTruthy();
    }
  });

  it('creates FTS5 virtual table for memories', () => {
    runMigrations(db);
    const fts = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memories_fts'")
      .get();
    expect(fts).toBeTruthy();
  });

  it('records migration version after running', () => {
    runMigrations(db);
    const versions = db.prepare('SELECT version, name FROM _migrations').all();
    expect(versions).toHaveLength(1);
    expect(versions[0].version).toBe(1);
    expect(versions[0].name).toBe('initial_schema');
  });

  it('is idempotent — running twice does not error or duplicate', () => {
    runMigrations(db);
    runMigrations(db); // Second run
    const versions = db.prepare('SELECT version FROM _migrations').all();
    expect(versions).toHaveLength(1);
  });

  it('applies only new migrations when adding v2', () => {
    runMigrations(db); // v1
    // Simulate adding v2 migration
    const v1Count = db.prepare('SELECT COUNT(*) as c FROM _migrations').get();
    expect(v1Count.c).toBe(1);
  });

  it('sets WAL journal mode', () => {
    db.pragma('journal_mode = WAL');
    const mode = db.pragma('journal_mode', { simple: true });
    expect(mode).toBe('wal');
  });
});
```

### `server/tests/phase-0/config-generation.test.ts` — Config Generation

```typescript
import { describe, it, expect } from 'vitest';
import { generateConfig, DEFAULTS } from '../../src/onboard/steps/11-awakening';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

describe('Config Generation', () => {
  const tmpDir = join(__dirname, '__tmp_config__');

  it('generates .env file with all required keys', async () => {
    await generateConfig({ userName: 'TestUser', ...DEFAULTS }, tmpDir);
    const env = readFileSync(join(tmpDir, '.env'), 'utf-8');
    const requiredKeys = [
      'NEO_PORT',
      'NEO_WS_TOKEN',
      'NEO_WORKSPACE_PATH',
      'NEO_PERMISSION_MODE',
      'NEO_DEFAULT_MODEL',
      'NEO_PERSONALITY_INTENSITY',
      'NEO_FADE_THRESHOLD',
      'NEO_GATE_PHRASE',
      'NEO_DAILY_LOG_CRON',
    ];
    for (const key of requiredKeys) {
      expect(env, `Missing ${key} in .env`).toContain(key);
    }
  });

  it('generates a random WS token (not empty, not default)', async () => {
    await generateConfig({ userName: 'TestUser', ...DEFAULTS }, tmpDir);
    const env = readFileSync(join(tmpDir, '.env'), 'utf-8');
    const match = env.match(/NEO_WS_TOKEN=(.+)/);
    expect(match).toBeTruthy();
    expect(match![1].length).toBeGreaterThanOrEqual(16);
  });

  it('uses DEFAULTS when running Blue Pill', async () => {
    await generateConfig({ userName: 'TestUser', ...DEFAULTS }, tmpDir);
    const env = readFileSync(join(tmpDir, '.env'), 'utf-8');
    expect(env).toContain(`NEO_DEFAULT_MODEL=${DEFAULTS.defaultModel}`);
    expect(env).toContain(`NEO_PERMISSION_MODE=${DEFAULTS.permissionMode}`);
  });

  it('uses custom values when provided (Red Pill)', async () => {
    await generateConfig(
      { userName: 'TestUser', defaultModel: 'opus', permissionMode: 'acceptEdits' },
      tmpDir,
    );
    const env = readFileSync(join(tmpDir, '.env'), 'utf-8');
    expect(env).toContain('NEO_DEFAULT_MODEL=opus');
    expect(env).toContain('NEO_PERMISSION_MODE=acceptEdits');
  });
});
```

### `server/tests/phase-0/workspace-files.test.ts` — Workspace File Generation

```typescript
import { describe, it, expect } from 'vitest';
import { writeWorkspaceFiles } from '../../src/onboard/steps/11-awakening';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

describe('Workspace File Generation', () => {
  const tmpDir = join(__dirname, '__tmp_workspace__');

  it('creates AGENTS.md with user name and agent name', async () => {
    await writeWorkspaceFiles({ userName: 'Morpheus', agentName: 'Neo' }, tmpDir);
    const content = readFileSync(join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('Morpheus');
    expect(content).toContain('Neo');
  });

  it('creates SOUL.md with personality parameters', async () => {
    await writeWorkspaceFiles({ personality: 'full-existential-crisis' }, tmpDir);
    const content = readFileSync(join(tmpDir, 'SOUL.md'), 'utf-8');
    expect(content).toContain('existential');
  });

  it('creates all 5 default story files', async () => {
    await writeWorkspaceFiles({}, tmpDir);
    const storyFiles = [
      '01-who-i-am.md',
      '02-how-i-work.md',
      '03-my-rules.md',
      '04-my-human.md',
      '05-my-mission.md',
    ];
    for (const file of storyFiles) {
      expect(existsSync(join(tmpDir, 'stories', file)), `Missing ${file}`).toBe(true);
    }
  });

  it('creates .claude/settings.json with deny rules', async () => {
    await writeWorkspaceFiles({}, tmpDir);
    const settings = JSON.parse(readFileSync(join(tmpDir, '.claude', 'settings.json'), 'utf-8'));
    expect(settings.permissions.deny).toContain('Bash(rm -rf *)');
    expect(settings.permissions.deny).toContain('Bash(sudo *)');
    expect(settings.permissions.deny).toContain('Write(~/.ssh/*)');
  });

  it('does not overwrite existing files if already present', async () => {
    await writeWorkspaceFiles({}, tmpDir);
    const firstContent = readFileSync(join(tmpDir, 'AGENTS.md'), 'utf-8');
    await writeWorkspaceFiles({}, tmpDir); // Second run
    const secondContent = readFileSync(join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(secondContent).toBe(firstContent);
  });
});
```

### `server/tests/phase-0/shared-types.test.ts` — Shared Types Package

```typescript
import { describe, it, expect } from 'vitest';
import type { Session, Message, GateVerdict, HealthStatus } from '@neo-agent/shared';

describe('Shared Types Package', () => {
  it('Session interface enforces required fields', () => {
    const session: Session = {
      id: 'test-1',
      channel: 'web',
      model: 'sonnet',
      status: 'active',
      startedAt: Date.now(),
      totalTokens: 0,
    };
    expect(session.id).toBe('test-1');
    expect(session.channel).toBe('web');
  });

  it('Message interface enforces role union type', () => {
    const validRoles: Message['role'][] = ['user', 'assistant', 'system', 'tool'];
    expect(validRoles).toHaveLength(4);
  });

  it('GateVerdict has optional fields', () => {
    const minimal: GateVerdict = { blocked: false };
    const full: GateVerdict = { blocked: true, reason: 'test', neoQuip: 'quip', confidence: 0.9 };
    expect(minimal.blocked).toBe(false);
    expect(full.reason).toBe('test');
  });

  it('HealthStatus has nested tool health', () => {
    const health: HealthStatus = {
      status: 'operational',
      claude: { responsive: true, lastLatencyMs: 500 },
      memory: { dbSizeMb: 10, ftsEntries: 100 },
      gates: { blockedLast1h: 0 },
      sync: { behind: false },
      tools: {
        composio: { available: true },
        firecrawl: { available: false, degraded: 'rate limited' },
      },
    };
    expect(health.tools.firecrawl.degraded).toBe('rate limited');
  });
});
```

---

## Acceptance Criteria

- [ ] `pnpm install` succeeds with zero errors
- [ ] `pnpm neo:onboard` runs the wizard → generates `.env`, DB, workspace files
- [ ] Blue Pill completes in ≤3 prompts
- [ ] Red Pill has all 11 steps functional
- [ ] SDK POC script runs and documents actual event types
- [ ] SQLite DB created with all tables + `_migrations` tracking
- [ ] `packages/shared` types importable from both `server` and `dashboard`
- [ ] `workspace/.claude/settings.json` generated with safe defaults
- [ ] All Phase 0 tests pass: `pnpm --filter server run test -- --grep "phase-0"`

---

## Files Created in This Phase

```
neo-agent/
├── package.json                 ← NEW
├── pnpm-workspace.yaml          ← NEW
├── tsconfig.json                ← NEW
├── .env.example                 ← NEW
├── packages/shared/
│   ├── package.json             ← NEW
│   └── src/index.ts             ← NEW (shared types)
├── server/
│   ├── package.json             ← NEW
│   ├── tsconfig.json            ← NEW
│   ├── tsup.config.ts           ← NEW
│   └── src/
│       ├── poc/sdk-test.ts      ← NEW (C1 validation)
│       ├── db/
│       │   ├── connection.ts    ← NEW
│       │   └── migrations.ts    ← NEW
│       └── onboard/
│           ├── wizard.ts        ← NEW
│           ├── steps/01-11      ← NEW (11 files)
│           └── templates/       ← NEW
└── dashboard/
    └── package.json             ← NEW (placeholder)
```
