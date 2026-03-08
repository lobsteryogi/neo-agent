# Phase 3 — Dodge This (Smart Router & The Armory)

> _"Dodge this."_

**Goal**: Build the smart model router (heuristic classifier → tier selection with audit logging) and the tool integration layer (registry, health checks, Agent Browser, Cron).

**Estimated time**: 4-6 hours
**Prerequisites**: Phase 2 complete (memory system working)

---

## 3.1 — Smart Router (Dodge This)

Classify inbound messages and route to the optimal model tier. Begin with regex heuristics (v1), log every decision for future calibration.

### `server/src/router/classifier.ts`

Heuristic task classification — regex for v1, with routing outcome tracking for calibration (Audit Fix S2).

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

A unified registry where every tool integration implements `ToolIntegration` — providing standardized health checks and optional fallback descriptions.

### Tool Health Check Interface (Audit Fix S3)

```typescript
// server/src/tools/registry.ts
export interface ToolIntegration {
  name: string;
  healthCheck(): Promise<{ available: boolean; degraded?: string }>;
  fallback?(): string; // Fallback behavior description
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
  it('Agent Browser checks CLI exists', async () => {
    const health = await new BrowserTool().healthCheck();
    expect(typeof health.available).toBe('boolean');
  });

  it('Cron tool is always available (local)', async () => {
    expect((await new SchedulerTool().healthCheck()).available).toBe(true);
  });
});
```

---

## Acceptance Criteria

- [ ] Router classifies tasks and selects appropriate model tier
- [ ] Routing decisions logged to `audit_log` for calibration
- [ ] All tool integrations implement `ToolIntegration` with health checks
- [ ] Cron schedules execute on time
- [ ] `/api/health` includes tool health status

---

## Files Created

```text
server/src/
├── router/
│   ├── classifier.ts          ← NEW
│   ├── engine.ts              ← NEW
│   └── profiles.ts            ← NEW
└── tools/
    ├── registry.ts            ← NEW (ToolIntegration interface, health checks)
    ├── browser.ts             ← NEW (Agent Browser)
    └── scheduler.ts           ← NEW (Cron)
```
