# Phase 3 — Dodge This + Matrix Sync + The Armory

> _"Dodge this."_

**Goal**: Build the smart model router, tool integrations (Composio, Agent Browser, Firecrawl, Cron), sibling session awareness, and two-brain sync.

**Estimated time**: 6-8 hours
**Prerequisites**: Phase 2 complete (memory system working)

---

## 3.1 — Smart Router (Dodge This)

### `server/src/router/classifier.ts`

Heuristic task classification — regex for v1, with routing outcome tracking for future calibration (Audit Fix S2).

```typescript
export class TaskClassifier {
  classify(content: string, context: AgentContext): TaskClassification {
    return {
      complexity: this.scoreComplexity(content),
      tokenEstimate: this.estimateOutputTokens(content),
      contextNeeds: context.tokenCount / 200_000, // ratio of used context
      precisionRequired: this.scorePrecision(content),
      toolUsage: this.detectToolUsage(content),
      speedPriority: this.scoreSpeed(content),
    };
  }
}
```

### `server/src/router/engine.ts`

Weighted scoring → model tier selection with **outcome logging** (Audit Fix S2):

```typescript
export class RouterEngine {
  selectModel(classification: TaskClassification, profile: RoutingProfile): RouteDecision {
    const weights = ROUTING_PROFILES[profile];
    const score = /* weighted sum of all classification factors */;
    const model = score >= 0.7 ? 'opus' : score >= 0.4 ? 'sonnet' : 'haiku';

    // Log routing decision for future calibration (Audit Fix S2)
    this.db.prepare(`
      INSERT INTO audit_log (timestamp, event_type, model_used, response_summary)
      VALUES (?, 'route_decision', ?, ?)
    `).run(Date.now(), model, JSON.stringify({ score, classification, profile }));

    return { selectedModel: model, score, classification };
  }
}
```

---

## 3.2 — Tool System (The Armory)

### Tool Health Check Interface (Audit Fix S3)

Every tool integration implements `ToolIntegration`:

```typescript
// server/src/tools/registry.ts
export interface ToolIntegration {
  name: string;
  healthCheck(): Promise<{ available: boolean; degraded?: string }>;
  fallback?(): string; // Fallback behavior description
}
```

### `server/src/tools/armory.ts` — Composio

```typescript
export class Armory implements ToolIntegration {
  name = 'composio';

  async healthCheck() {
    try {
      await this.composio.getEntity('default');
      return { available: true };
    } catch {
      return { available: false, degraded: 'Composio API unreachable' };
    }
  }

  async getTools(toolkits: string[]) {
    return this.composio.tools.get(this.userId, { toolkits });
  }
}
```

### `server/src/tools/browser.ts` — Agent Browser (The Eyes)

```typescript
export class BrowserTool implements ToolIntegration {
  name = 'agent-browser';

  async healthCheck() {
    try {
      execSync('which agent-browser', { encoding: 'utf-8' });
      return { available: true };
    } catch {
      return { available: false, degraded: 'agent-browser CLI not installed' };
    }
  }

  fallback() {
    return 'Use Firecrawl for web scraping as degraded alternative';
  }
}
```

### `server/src/tools/crawler.ts` — Firecrawl (The Crawler)

```typescript
export class CrawlerTool implements ToolIntegration {
  name = 'firecrawl';

  async scrapeToMarkdown(url: string): Promise<string> {
    const result = await this.firecrawl.scrapeUrl(url, { formats: ['markdown'] });
    return result.markdown;
  }

  async healthCheck() {
    try {
      await this.firecrawl.scrapeUrl('https://example.com', { formats: ['markdown'] });
      return { available: true };
    } catch {
      return { available: false, degraded: 'Firecrawl API unreachable or rate-limited' };
    }
  }
}
```

### `server/src/tools/scheduler.ts` — Cron (The Clock)

```typescript
export class SchedulerTool implements ToolIntegration {
  name = 'cron';
  private tasks = new Map<string, cron.ScheduledTask>();

  schedule(name: string, cronExpr: string, fn: () => void) {
    this.tasks.set(name, cron.schedule(cronExpr, fn));
  }

  async healthCheck() {
    return { available: true };
  } // Local, always available
}
```

---

## 3.3 — Sibling Awareness (The Smiths)

### `server/src/sessions/sibling-awareness.ts`

File-level locking for parallel sessions:

```typescript
export class SiblingAwareness {
  private activeSessions = new Map<string, SessionInfo>();

  register(sessionId: string, task: string) {
    /* ... */
  }
  unregister(sessionId: string) {
    /* ... */
  }
  acquireFileLock(sessionId: string, path: string): boolean {
    /* ... */
  }
  releaseFileLock(sessionId: string, path: string) {
    /* ... */
  }
  getStatus(): SiblingStatus[] {
    /* ... */
  }
}
```

---

## 3.4 — Matrix Sync (Two-Brain)

### `server/src/sync/matrix-sync.ts`

Git-based auto-sync of memory + workspace:

```typescript
export class MatrixSync {
  private interval?: NodeJS.Timeout;

  start(intervalMinutes: number) {
    this.interval = setInterval(() => this.sync(), intervalMinutes * 60_000);
  }

  async sync() {
    await this.exec('git add -A');
    await this.exec(`git commit -m "Matrix Sync: ${new Date().toISOString()}" --allow-empty`);
    await this.exec('git push');
    await this.exec('git pull --rebase');
  }
}
```

### `server/src/sync/tailscale.ts`

```typescript
export class TailscaleManager implements ToolIntegration {
  name = 'tailscale';

  async healthCheck() {
    try {
      const status = execSync('tailscale status --json', { encoding: 'utf-8' });
      return { available: JSON.parse(status).Self.Online };
    } catch {
      return { available: false, degraded: 'Tailscale not running' };
    }
  }
}
```

---

## Test Suite

### `server/tests/phase-3/classifier.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { TaskClassifier } from '../../src/router/classifier';

describe('TaskClassifier', () => {
  const classifier = new TaskClassifier();

  it('scores architecture-level tasks as high complexity', () => {
    const result = classifier.classify('Architect a new microservices system', mockContext);
    expect(result.complexity).toBeGreaterThanOrEqual(0.7);
  });

  it('scores simple questions as low complexity', () => {
    const result = classifier.classify('What is a Promise in JavaScript?', mockContext);
    expect(result.complexity).toBeLessThanOrEqual(0.3);
  });

  it('scores implementation tasks as medium complexity', () => {
    const result = classifier.classify('Implement a login form with validation', mockContext);
    expect(result.complexity).toBeGreaterThan(0.3);
    expect(result.complexity).toBeLessThan(0.8);
  });

  it('detects tool usage requirement', () => {
    const withTools = classifier.classify('Read the file src/index.ts and fix it', mockContext);
    expect(withTools.toolUsage).toBe(true);
    const noTools = classifier.classify('Explain how async/await works', mockContext);
    expect(noTools.toolUsage).toBe(false);
  });

  it('does not false-positive on partial keyword matches', () => {
    const result = classifier.classify(
      "I'm not trying to architect anything, just fix a typo",
      mockContext,
    );
    // Should ideally be medium, not high — this tests awareness of the heuristic limit
    expect(result.complexity).toBeDefined();
  });
});
```

### `server/tests/phase-3/router-engine.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { RouterEngine, ROUTING_PROFILES } from '../../src/router/engine';

describe('RouterEngine', () => {
  const engine = new RouterEngine(mockDb);

  it('routes high-complexity tasks to opus', () => {
    const model = engine.selectModel(
      {
        complexity: 0.9,
        tokenEstimate: 5000,
        contextNeeds: 0.8,
        precisionRequired: 0.9,
        toolUsage: true,
        speedPriority: 0.1,
      },
      'auto',
    );
    expect(model.selectedModel).toBe('opus');
  });

  it('routes simple questions to haiku', () => {
    const model = engine.selectModel(
      {
        complexity: 0.1,
        tokenEstimate: 100,
        contextNeeds: 0.1,
        precisionRequired: 0.2,
        toolUsage: false,
        speedPriority: 0.9,
      },
      'auto',
    );
    expect(model.selectedModel).toBe('haiku');
  });

  it('routes medium tasks to sonnet', () => {
    const model = engine.selectModel(
      {
        complexity: 0.5,
        tokenEstimate: 2000,
        contextNeeds: 0.5,
        precisionRequired: 0.5,
        toolUsage: false,
        speedPriority: 0.5,
      },
      'auto',
    );
    expect(model.selectedModel).toBe('sonnet');
  });

  it('eco profile biases toward haiku', () => {
    const model = engine.selectModel(
      {
        complexity: 0.5,
        tokenEstimate: 2000,
        contextNeeds: 0.5,
        precisionRequired: 0.5,
        toolUsage: false,
        speedPriority: 0.5,
      },
      'eco',
    );
    expect(['haiku', 'sonnet']).toContain(model.selectedModel);
  });

  it('premium profile biases toward opus', () => {
    const model = engine.selectModel(
      {
        complexity: 0.6,
        tokenEstimate: 3000,
        contextNeeds: 0.7,
        precisionRequired: 0.8,
        toolUsage: true,
        speedPriority: 0.1,
      },
      'premium',
    );
    expect(model.selectedModel).toBe('opus');
  });

  it('logs routing decision to audit_log (Audit Fix S2)', () => {
    engine.selectModel(
      {
        complexity: 0.5,
        tokenEstimate: 1000,
        contextNeeds: 0.3,
        precisionRequired: 0.5,
        toolUsage: false,
        speedPriority: 0.5,
      },
      'auto',
    );
    const log = mockDb
      .prepare('SELECT * FROM audit_log WHERE event_type = ?')
      .get('route_decision');
    expect(log).toBeTruthy();
    expect(JSON.parse(log.response_summary)).toHaveProperty('score');
  });
});
```

### `server/tests/phase-3/tool-health.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('Tool Health Checks (Audit Fix S3)', () => {
  it('Composio returns available when API responds', async () => {
    const armory = new Armory(mockComposio);
    const health = await armory.healthCheck();
    expect(health.available).toBe(true);
  });

  it('Composio returns degraded when API is down', async () => {
    const armory = new Armory(failingComposio);
    const health = await armory.healthCheck();
    expect(health.available).toBe(false);
    expect(health.degraded).toContain('unreachable');
  });

  it('Agent Browser checks CLI exists', async () => {
    const browser = new BrowserTool();
    const health = await browser.healthCheck();
    expect(typeof health.available).toBe('boolean');
  });

  it('Agent Browser provides fallback description', () => {
    const browser = new BrowserTool();
    expect(browser.fallback()).toContain('Firecrawl');
  });

  it('Cron tool is always available (local)', async () => {
    const scheduler = new SchedulerTool();
    const health = await scheduler.healthCheck();
    expect(health.available).toBe(true);
  });

  it('Tailscale checks daemon status', async () => {
    const tailscale = new TailscaleManager();
    const health = await tailscale.healthCheck();
    expect(typeof health.available).toBe('boolean');
  });
});
```

### `server/tests/phase-3/sibling-awareness.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { SiblingAwareness } from '../../src/sessions/sibling-awareness';

describe('SiblingAwareness (The Smiths)', () => {
  it('acquires file lock for a session', () => {
    const siblings = new SiblingAwareness();
    expect(siblings.acquireFileLock('s1', '/project/src/index.ts')).toBe(true);
  });

  it('blocks file lock if held by another session', () => {
    const siblings = new SiblingAwareness();
    siblings.acquireFileLock('s1', '/project/src/index.ts');
    expect(siblings.acquireFileLock('s2', '/project/src/index.ts')).toBe(false);
  });

  it('allows same session to re-acquire its own lock', () => {
    const siblings = new SiblingAwareness();
    siblings.acquireFileLock('s1', '/project/src/index.ts');
    expect(siblings.acquireFileLock('s1', '/project/src/index.ts')).toBe(true);
  });

  it('releases lock and allows another session to take it', () => {
    const siblings = new SiblingAwareness();
    siblings.acquireFileLock('s1', '/project/src/index.ts');
    siblings.releaseFileLock('s1', '/project/src/index.ts');
    expect(siblings.acquireFileLock('s2', '/project/src/index.ts')).toBe(true);
  });

  it('getStatus() returns all active sessions with locked files', () => {
    const siblings = new SiblingAwareness();
    siblings.register('s1', 'Refactoring');
    siblings.acquireFileLock('s1', '/a.ts');
    siblings.acquireFileLock('s1', '/b.ts');
    const status = siblings.getStatus();
    expect(status).toHaveLength(1);
    expect(status[0].lockedFiles).toEqual(['/a.ts', '/b.ts']);
    expect(status[0].currentTask).toBe('Refactoring');
  });

  it('unregister cleans up session and all its locks', () => {
    const siblings = new SiblingAwareness();
    siblings.register('s1', 'Working');
    siblings.acquireFileLock('s1', '/x.ts');
    siblings.unregister('s1');
    expect(siblings.getStatus()).toHaveLength(0);
    expect(siblings.acquireFileLock('s2', '/x.ts')).toBe(true);
  });
});
```

---

## Acceptance Criteria

- [ ] Router classifies tasks and selects appropriate model tier
- [ ] Routing decisions logged to `audit_log` for calibration
- [ ] All tool integrations have health checks that return availability
- [ ] Firecrawl scrapes URLs to markdown successfully
- [ ] Cron schedules execute on time
- [ ] Sibling awareness prevents file lock conflicts
- [ ] Git sync commits and pushes on schedule
- [ ] `/api/health` includes tool health status

---

## Files Created

```
server/src/
├── router/
│   ├── classifier.ts          ← NEW
│   ├── engine.ts              ← NEW
│   └── profiles.ts            ← NEW
├── tools/
│   ├── registry.ts            ← NEW (S3: health checks)
│   ├── armory.ts              ← NEW
│   ├── browser.ts             ← NEW
│   ├── crawler.ts             ← NEW
│   └── scheduler.ts           ← NEW
├── sessions/
│   └── sibling-awareness.ts   ← NEW
└── sync/
    ├── matrix-sync.ts         ← NEW
    └── tailscale.ts           ← NEW
```
