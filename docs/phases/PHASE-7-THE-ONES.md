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

File-level locking for parallel sessions using the `sibling_locks` SQLite table:

```typescript
export class SiblingAwareness {
  private activeSessions = new Map<string, SessionInfo>();

  constructor(private db: Database.Database) {}

  register(sessionId: string, task?: string) {
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

Features:

- Re-entrant locks (same session can re-acquire)
- Dead session cleanup (stale locks from crashed sessions)
- Full status reporting with locked file lists

### 7.2 — Matrix Sync (Two-Brain)

#### `server/src/sync/matrix-sync.ts`

Git-based auto-sync of memory + workspace across machines:

```typescript
export class MatrixSync {
  constructor(private cwd: string) {}

  start(intervalMinutes: number) {
    /* ... */
  }
  stop() {
    /* ... */
  }
  async sync(): Promise<{ success: boolean; error?: string }> {
    // git add -A → git commit → git push → git pull --rebase
  }
}
```

#### `server/src/sync/tailscale.ts`

```typescript
export class TailscaleManager {
  name = 'tailscale';
  healthCheck(): ToolHealth {
    /* ... */
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
export class AgentRegistry {
  private blueprints = new Map<string, AgentBlueprint>();

  register(blueprint: AgentBlueprint) {
    /* ... */
  }
  get(name: string): AgentBlueprint | undefined {
    /* ... */
  }
  getAll(): AgentBlueprint[] {
    /* ... */
  }
  has(name: string): boolean {
    /* ... */
  }
  loadFromDirectory(agentsDir: string) {
    /* ... */
  }
  reload(agentsDir: string) {
    /* ... */
  }
}
```

Parses AGENT.md frontmatter (name, description, model, maxTurns, timeoutMs, allowedTools) and reads companion CLAUDE.md files.

#### Built-in Blueprints

| Agent        | Role                         | Model  | Tools                    | Use Case                           |
| ------------ | ---------------------------- | ------ | ------------------------ | ---------------------------------- |
| `researcher` | Web research & summarization | sonnet | firecrawl, agent-browser | Gather info from URLs and APIs     |
| `coder`      | Write & edit code            | opus   | filesystem, git          | Implement features in branches     |
| `reviewer`   | Code review & QA             | opus   | filesystem (read-only)   | Review changes, find bugs          |
| `planner`    | Task decomposition           | sonnet | none                     | Break complex tasks into sub-tasks |
| `debugger`   | Error investigation          | opus   | filesystem, logs         | Root cause analysis                |

### 7.4 — Sub-Agent Spawner

#### `server/src/agents/spawner.ts`

Creates isolated Claude sessions for sub-agents with their own context window, working directory, and optional `CLAUDE.md`.

```typescript
export class SubAgentSpawner {
  constructor(
    private bridge: ClaudeBridge,
    private agentWorkspaceDir: string,
  ) {}

  async spawn(blueprint: AgentBlueprint, task: SubAgentTask): Promise<SubAgentResult> {
    // 1. Create isolated workspace
    // 2. Build context (prompt + optional chained context from previous agent)
    // 3. Run via ClaudeBridge with blueprint config
    // 4. Collect artifacts from output directory
    // 5. Cleanup workspace
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
| `supervisor` | All agents work in parallel, then a planner agent synthesizes results           |

```typescript
export class Orchestrator {
  constructor(
    private spawner: SubAgentSpawner,
    private registry: AgentRegistry,
    private db: Database.Database,
    config?: Partial<AgentConfig>,
  ) {}

  shouldDecompose(message: InboundMessage): DecomposeDecision {
    /* ... */
  }
  createTeam(pattern, tasks, parentSession?): AgentTeam {
    /* ... */
  }
  async executeTeam(team: AgentTeam): Promise<AgentTeam> {
    /* ... */
  }
  getTeam(teamId: string): AgentTeam | undefined {
    /* ... */
  }
  listTeams(): AgentTeam[] {
    /* ... */
  }
}
```

Decomposition signals: `multiStep`, `research`, `parallel`, `review`, `complex` (content > 500 chars). Default threshold: 2 signals.

### 7.6 — Agent Communication Bus

#### `server/src/agents/message-bus.ts`

Direct inter-agent communication within a team. Agents can post findings to a shared bus that sibling agents can read.

```typescript
export class AgentMessageBus {
  private messages = new Map<string, AgentMessage[]>(); // teamId → messages

  post(msg: Omit<AgentMessage, 'id' | 'timestamp'>): AgentMessage {
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

NanoClaw-inspired filesystem isolation. Each sub-agent gets a scoped working directory with CLAUDE.md and a writable output area.

```typescript
export class AgentWorkspace {
  constructor(private tempDir: string) {}

  create(opts: WorkspaceOptions): IsolatedWorkspace {
    /* ... */
  }
  collectArtifacts(workspace: IsolatedWorkspace): AgentArtifact[] {
    /* ... */
  }
  cleanup(workspace: IsolatedWorkspace) {
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

const decompose = this.orchestrator.shouldDecompose(sanitized);
if (decompose.shouldDecompose) {
  const team = this.orchestrator.createTeam(
    decompose.suggestedPattern,
    [{ id: `task-${Date.now()}`, blueprintName: 'planner', prompt: sanitized.content }],
    session.id,
  );
  const completedTeam = await this.orchestrator.executeTeam(team);
  // ... synthesize and return results
}
```

### API Endpoints — `server/src/index.ts`

```typescript
GET  /api/agents/blueprints        // List all registered agent blueprints
GET  /api/agents/teams             // List all agent teams (active + historical)
GET  /api/agents/teams/:id         // Get team details with sub-agent results
POST /api/agents/teams             // Create and execute a new agent team
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
  it('parses allowedTools from frontmatter');
});
```

### `server/tests/phase-7/orchestrator.test.ts`

```typescript
describe('Orchestrator', () => {
  it('detects multi-step tasks as decomposable');
  it('does not decompose simple tasks');
  it('selects parallel pattern when parallel signals detected');
  it('createTeam() produces valid team structure');
  it('respects decompositionThreshold configuration');
  it('persists team to database on executeTeam');
  it('listTeams() returns all persisted teams');
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
  it('creates isolated workspace with output directory');
  it('writes CLAUDE.md with agent name and task');
  it('collects artifacts from output directory');
  it('cleanup removes the entire workspace directory');
});
```

---

## Acceptance Criteria

### Part A — Multi-Session

- [x] Sibling awareness prevents file lock conflicts between parallel sessions
- [x] Git sync commits and pushes on schedule
- [x] Tailscale health check reports connectivity status

### Part B — Sub-Agents

- [x] Agent blueprints definable via code or `AGENT.md` files
- [x] Sub-agents spawn with isolated context windows and working directories
- [x] Three orchestration patterns work: sequential, parallel, supervisor
- [x] Agent message bus enables inter-agent communication within a team
- [x] Orchestrator auto-detects decomposable tasks with configurable threshold
- [x] Agent teams persisted to SQLite with full status tracking
- [x] Max concurrent agents limit enforced
- [x] Workspace isolation prevents sub-agents from modifying main workspace

---

## Files Created

```text
server/src/sessions/
└── sibling-awareness.ts    ← NEW (file locking between sessions)

server/src/sync/
├── matrix-sync.ts          ← NEW (git-based workspace sync)
└── tailscale.ts            ← NEW (network connectivity)

server/src/agents/
├── index.ts                ← NEW (barrel export)
├── registry.ts             ← NEW (agent blueprints)
├── spawner.ts              ← NEW (sub-agent lifecycle)
├── orchestrator.ts         ← NEW (team coordination)
├── message-bus.ts          ← NEW (inter-agent comms)
└── workspace.ts            ← NEW (filesystem isolation)

server/src/core/
└── agent.ts                ← MODIFIED (decomposition hook)

server/src/db/
└── migrations.ts           ← MODIFIED (v3: agent_teams, agent_messages)

packages/shared/src/
└── index.ts                ← MODIFIED (Phase 7 types)

server/workspace/agents/
├── researcher/AGENT.md     ← NEW (sonnet)
├── coder/AGENT.md          ← NEW (opus)
├── reviewer/AGENT.md       ← NEW (opus)
├── planner/AGENT.md        ← NEW (sonnet)
└── debugger/AGENT.md       ← NEW (opus)
```
