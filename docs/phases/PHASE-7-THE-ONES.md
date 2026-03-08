# Phase 7 — The Ones (Multi-Session & Sub-Agent Orchestration)

> _"He is The One... but he doesn't have to do it alone."_

**Goal**: Build multi-session coordination (sibling awareness, file locking, git-based sync) and a sub-agent orchestration system (spawn, coordinate, and supervise specialized child agents for parallel execution and task decomposition).

**Estimated time**: 8-12 hours
**Prerequisites**: Phase 1 (agent loop), Phase 2 (memory), Phase 3 (tool registry)

---

## Prior Art & Design Influences

| Project / Feature                                | Key Insight Adopted                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| [NanoClaw](https://github.com/qwibitai/nanoclaw) | Per-agent isolated context, single-process orchestrator, agent swarms        |
| Claude Agent SDK — Subagents                     | Isolated context windows per subtask, parallel spawning, report-back pattern |
| Claude Agent SDK — Agent Teams                   | Shared task lists, direct agent-to-agent messaging, team lead coordination   |
| CrewAI                                           | Role-based agent definitions, structured collaboration                       |

### Design Principles

1. **Lightweight** — No microservices, no separate processes. Inspired by NanoClaw's "small enough to understand" philosophy.
2. **Context isolation** — Each sub-agent gets its own Claude session with focused instructions. Prevents subtask noise from polluting the main context.
3. **Supervisor pattern** — Neo (main agent) acts as team lead. Sub-agents report results back. Neo synthesizes.
4. **Shared memory, isolated execution** — Sub-agents can _read_ from Déjà Vu tiers but write to a scoped scratch space.

---

## Part A — Multi-Session Awareness (The Smiths)

Coordinate parallel Neo sessions running on the same workspace. Prevent file conflicts and keep workspace state in sync.

### 7.1 — Sibling Awareness

#### `server/src/sessions/sibling-awareness.ts`

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

### 7.2 — Matrix Sync (Two-Brain)

#### `server/src/sync/matrix-sync.ts`

Git-based auto-sync of memory + workspace across machines:

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

#### `server/src/sync/tailscale.ts`

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

## Part B — Sub-Agent Orchestration (The Ones)

Spawn specialized child agents, coordinate them in teams, and synthesize their results.

> **Shared pattern**: The agent blueprint registry follows the same `*.md` frontmatter + directory scan convention as the Skill System (Phase 6). The key difference is that `AGENT.md` defines a _persona with constrained tools_, while `SKILL.md` defines _injectable instructions_.

### 7.3 — Agent Blueprint Registry

#### `server/src/agents/registry.ts`

Define reusable agent blueprints. Each blueprint specifies a focused persona with constrained tools and instructions.

```typescript
export interface AgentBlueprint {
  name: string;
  description: string;
  systemPrompt: string;
  allowedTools?: string[];
  maxTurns?: number;
  timeoutMs?: number;
  model?: 'haiku' | 'sonnet' | 'opus';
  workingDir?: string;
  claudeMd?: string; // Per-agent CLAUDE.md content (NanoClaw pattern)
}

export class AgentRegistry {
  private blueprints = new Map<string, AgentBlueprint>();

  register(blueprint: AgentBlueprint) {
    this.blueprints.set(blueprint.name, blueprint);
  }
  get(name: string): AgentBlueprint | undefined {
    return this.blueprints.get(name);
  }
  getAll(): AgentBlueprint[] {
    return Array.from(this.blueprints.values());
  }

  loadFromDirectory(agentsDir: string) {
    // Scan for AGENT.md frontmatter files — same convention as SkillLoader (Phase 6)
    const folders = readdirSync(agentsDir, { withFileTypes: true }).filter((d) => d.isDirectory());
    for (const folder of folders) {
      const agentMdPath = join(agentsDir, folder.name, 'AGENT.md');
      if (existsSync(agentMdPath)) {
        this.register(this.parseAgentMd(agentMdPath));
      }
    }
  }
}
```

#### Built-in Blueprints

| Agent        | Role                         | Model  | Tools                    | Use Case                           |
| ------------ | ---------------------------- | ------ | ------------------------ | ---------------------------------- |
| `researcher` | Web research & summarization | haiku  | firecrawl, agent-browser | Gather info from URLs and APIs     |
| `coder`      | Write & edit code            | sonnet | filesystem, git          | Implement features in branches     |
| `reviewer`   | Code review & QA             | sonnet | filesystem (read-only)   | Review changes, find bugs          |
| `planner`    | Task decomposition           | sonnet | none                     | Break complex tasks into sub-tasks |
| `debugger`   | Error investigation          | sonnet | filesystem, logs         | Root cause analysis                |

### 7.4 — Sub-Agent Spawner

#### `server/src/agents/spawner.ts`

Creates isolated Claude sessions for sub-agents with their own context window, working directory, and optional `CLAUDE.md`.

```typescript
export class SubAgentSpawner {
  constructor(
    private bridge: ClaudeBridge,
    private memory: MemorySearch,
    private config: AgentConfig,
  ) {}

  async spawn(blueprint: AgentBlueprint, task: SubAgentTask): Promise<SubAgentResult> {
    const context = await this.buildContext(blueprint, task);
    const workDir = await this.createWorkspace(blueprint, task);

    if (blueprint.claudeMd) {
      writeFileSync(join(workDir, 'CLAUDE.md'), blueprint.claudeMd);
    }

    const result = await this.bridge.run(context.prompt, {
      cwd: workDir,
      model: blueprint.model,
      allowedTools: blueprint.allowedTools,
      maxTurns: blueprint.maxTurns ?? 5,
      timeoutMs: blueprint.timeoutMs ?? 120_000,
      systemPrompt: context.systemPrompt,
    });

    return {
      agentName: blueprint.name,
      taskId: task.id,
      success: result.success,
      output: result.data,
      artifacts: await this.collectArtifacts(workDir),
      tokensUsed: result.tokensUsed,
      durationMs: result.durationMs,
    };
  }
}
```

### 7.5 — Orchestrator (The Architect)

#### `server/src/agents/orchestrator.ts`

Decides _when_ to spawn sub-agents and _how_ to coordinate them. Supports three orchestration patterns:

| Pattern      | Behavior                                                                        |
| ------------ | ------------------------------------------------------------------------------- |
| `sequential` | Agents run one after another, each building on previous output                  |
| `parallel`   | All agents run simultaneously (capped by `maxConcurrentAgents`), results merged |
| `supervisor` | All agents work in parallel, then a supervisor agent synthesizes results        |

```typescript
export class Orchestrator {
  constructor(
    private spawner: SubAgentSpawner,
    private registry: AgentRegistry,
    private db: Database.Database,
  ) {}

  async shouldDecompose(message: InboundMessage): Promise<DecomposeDecision> {
    const signals = {
      multiStep: /and then|after that|first.*then|step \d/i.test(message.content),
      research: /research|find out|compare|analyze multiple/i.test(message.content),
      parallel: /at the same time|simultaneously|in parallel|both/i.test(message.content),
      review: /review.*and.*fix|audit|check all/i.test(message.content),
      complex: message.content.length > 500,
    };

    const score = Object.values(signals).filter(Boolean).length;
    return {
      shouldDecompose: score >= 2,
      suggestedPattern: signals.parallel ? 'parallel' : 'sequential',
      signals,
    };
  }

  async executeTeam(team: AgentTeam): Promise<AgentTeam> {
    /* ... */
  }

  private async executeParallel(tasks: SubAgentTask[]): Promise<SubAgentResult[]> {
    // Spawn all agents concurrently, bounded by maxConcurrentAgents
    const concurrency = Math.min(tasks.length, this.config.maxConcurrentAgents ?? 3);
    // ... batch execution with Promise.all
  }

  private async executeSequential(tasks: SubAgentTask[]): Promise<SubAgentResult[]> {
    // Each agent receives previous agent's output as context
  }

  private async executeSupervisor(tasks: SubAgentTask[]): Promise<SubAgentResult[]> {
    // Phase 1: parallel execution → Phase 2: planner agent synthesizes all outputs
  }
}
```

### 7.6 — Agent Communication Bus

#### `server/src/agents/message-bus.ts`

Direct inter-agent communication within a team. Agents can post findings to a shared bus that sibling agents can read.

```typescript
export interface AgentMessage {
  id: string;
  teamId: string;
  fromAgent: string;
  toAgent: string | '*'; // '*' = broadcast to all
  type: 'finding' | 'question' | 'update' | 'artifact';
  content: string;
  timestamp: number;
}

export class AgentMessageBus {
  private messages = new Map<string, AgentMessage[]>(); // teamId → messages

  post(msg: Omit<AgentMessage, 'id' | 'timestamp'>) {
    /* ... */
  }
  getForAgent(teamId: string, agentName: string): AgentMessage[] {
    /* ... */
  }
  getAll(teamId: string): AgentMessage[] {
    /* ... */
  }
  clear(teamId: string) {
    /* ... */
  }
}
```

### 7.7 — Workspace Isolation

#### `server/src/agents/workspace.ts`

NanoClaw-inspired filesystem isolation. Each sub-agent gets a scoped working directory with read-only source symlinks and a writable output area.

```typescript
export class AgentWorkspace {
  async create(opts: WorkspaceOptions): Promise<IsolatedWorkspace> {
    const baseDir = join(this.tempDir, 'agents', opts.taskId);
    const srcDir = join(baseDir, 'src'); // Read-only (symlinks)
    const outDir = join(baseDir, 'output'); // Writable
    // ... mount source files, write CLAUDE.md
    return { baseDir, srcDir, outDir };
  }

  async collectArtifacts(workspace: IsolatedWorkspace): Promise<AgentArtifact[]> {
    /* ... */
  }
  async cleanup(workspace: IsolatedWorkspace) {
    /* ... */
  }
}
```

---

## 7.8 — Integration with Agent Loop

### Changes to `server/src/core/agent.ts`

The main agent loop gains the ability to detect decomposable tasks and delegate to sub-agents:

```typescript
// In NeoAgent._executeLoop() — after Route, before Gate

const decompose = await this.orchestrator.shouldDecompose(sanitized);
if (decompose.shouldDecompose) {
  const team = await this.orchestrator.planTeam(sanitized, decompose);
  this.emit('team:started', team);

  const completedTeam = await this.orchestrator.executeTeam(team);

  for (const result of completedTeam.results) {
    await this.memory.record(session, {
      role: 'tool',
      content: `[Sub-agent: ${result.agentName}] ${result.output}`,
    });
  }

  this.emit('team:completed', completedTeam);
  return this.synthesizeTeamResults(completedTeam, session);
}
```

---

## 7.9 — Database Migration (v3)

```sql
CREATE TABLE agent_teams (
  id TEXT PRIMARY KEY,
  pattern TEXT NOT NULL CHECK(pattern IN ('sequential', 'parallel', 'supervisor')),
  agents TEXT NOT NULL,        -- JSON array of SubAgentTask
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'running', 'completed', 'failed')),
  results TEXT,                -- JSON array of SubAgentResult
  parent_session TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (parent_session) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_agent_teams_status ON agent_teams(status);
CREATE INDEX idx_agent_teams_session ON agent_teams(parent_session);

CREATE TABLE agent_messages (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('finding', 'question', 'update', 'artifact')),
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (team_id) REFERENCES agent_teams(id) ON DELETE CASCADE
);

CREATE INDEX idx_agent_messages_team ON agent_messages(team_id, timestamp);
```

---

## 7.10 — Configuration

### `server/src/config/agents.ts`

```typescript
export interface AgentConfig {
  maxConcurrentAgents: number; // Default: 3
  defaultSubAgentTimeout: number; // Default: 120_000 (2 min)
  defaultSubAgentMaxTurns: number; // Default: 5
  agentWorkspaceDir: string; // Default: /tmp/neo-agents
  autoDecompose: boolean; // Default: true
  decompositionThreshold: number; // Default: 2 — minimum signal score
  blueprintsDir: string; // Default: workspace/agents/
}
```

```env
NEO_MAX_CONCURRENT_AGENTS=3
NEO_AGENT_TIMEOUT_MS=120000
NEO_AUTO_DECOMPOSE=true
```

---

## 7.11 — Dashboard Views

### Agent Teams View — `dashboard/src/components/TheOnes/`

| Component              | Purpose                                                  |
| ---------------------- | -------------------------------------------------------- |
| `TeamView.tsx`         | Active and historical agent teams with status            |
| `AgentCard.tsx`        | Individual sub-agent status, output preview, token usage |
| `TeamTimeline.tsx`     | Visual timeline of parallel/sequential execution         |
| `BlueprintBrowser.tsx` | Browse and manage registered agent blueprints            |

### API Endpoints

```typescript
GET  /api/agents/blueprints        // List all registered agent blueprints
GET  /api/agents/teams             // List all agent teams (active + historical)
GET  /api/agents/teams/:id         // Get team details with sub-agent results
POST /api/agents/teams             // Manually create a new agent team
GET  /api/agents/messages/:teamId  // Get message bus history for a team
```

---

## Test Suite

### `server/tests/phase-7/sibling-awareness.test.ts`

```typescript
describe('SiblingAwareness (The Smiths)', () => {
  it('acquires file lock for a session');
  it('blocks file lock if held by another session');
  it('allows same session to re-acquire its own lock');
  it('releases lock and allows another session to take it');
  it('getStatus() returns all active sessions with locked files');
  it('unregister cleans up session and all its locks');
});
```

### `server/tests/phase-7/agent-registry.test.ts`

```typescript
describe('AgentRegistry', () => {
  it('registers and retrieves a blueprint');
  it('returns undefined for non-existent blueprint');
  it('lists all registered blueprints');
  it('overwrites blueprint with same name');
  it('loads blueprints from AGENT.md files in directory');
  it('ignores directories without AGENT.md');
});
```

### `server/tests/phase-7/orchestrator.test.ts`

```typescript
describe('Orchestrator', () => {
  it('detects multi-step tasks as decomposable');
  it('does not decompose simple tasks');
  it('selects parallel pattern when parallel signals detected');
  it('respects maxConcurrentAgents limit');
  it('sequential pattern passes previous output to next agent');
  it('supervisor pattern runs synthesis after all agents complete');
  it('persists team status to database');
});
```

### `server/tests/phase-7/message-bus.test.ts`

```typescript
describe('AgentMessageBus', () => {
  it('posts and retrieves messages for a specific agent');
  it('broadcast messages are visible to all agents');
  it('isolates messages by teamId');
  it('clear removes all messages for a team');
  it('messages have auto-generated id and timestamp');
});
```

### `server/tests/phase-7/workspace.test.ts`

```typescript
describe('AgentWorkspace', () => {
  it('creates isolated workspace with src and output directories');
  it('writes CLAUDE.md with agent name and task');
  it('collects artifacts from output directory');
  it('cleanup removes the entire workspace directory');
});
```

---

## Acceptance Criteria

### Part A — Multi-Session

- [ ] Sibling awareness prevents file lock conflicts between parallel sessions
- [ ] Git sync commits and pushes on schedule
- [ ] Tailscale health check reports connectivity status

### Part B — Sub-Agents

- [ ] Agent blueprints definable via code or `AGENT.md` files
- [ ] Sub-agents spawn with isolated context windows and working directories
- [ ] Three orchestration patterns work: sequential, parallel, supervisor
- [ ] Agent message bus enables inter-agent communication within a team
- [ ] Orchestrator auto-detects decomposable tasks with configurable threshold
- [ ] Sub-agent results recorded in Neo's memory (Déjà Vu T1)
- [ ] Agent teams persisted to SQLite with full status tracking
- [ ] Dashboard "The Ones" view shows active/historical agent teams
- [ ] Max concurrent agents limit enforced
- [ ] Workspace isolation prevents sub-agents from modifying main workspace

---

## Files Created

```text
server/src/sessions/
└── sibling-awareness.ts    ← NEW (file locking between sessions)

server/src/sync/
├── matrix-sync.ts          ← NEW (git-based workspace sync)
└── tailscale.ts            ← NEW (network connectivity)

server/src/agents/
├── registry.ts             ← NEW (agent blueprints)
├── spawner.ts              ← NEW (sub-agent lifecycle)
├── orchestrator.ts         ← NEW (team coordination)
├── message-bus.ts          ← NEW (inter-agent comms)
└── workspace.ts            ← NEW (filesystem isolation)

server/src/core/
└── agent.ts                ← MODIFIED (decomposition hook)

server/src/db/
└── migrations.ts           ← MODIFIED (v3: agent_teams, agent_messages)

workspace/agents/
├── researcher/AGENT.md     ← NEW (built-in blueprint)
├── coder/AGENT.md          ← NEW
├── reviewer/AGENT.md       ← NEW
├── planner/AGENT.md        ← NEW
└── debugger/AGENT.md       ← NEW

dashboard/src/components/
└── TheOnes/                ← NEW (4 component files)
```
