# Neo-Agent — Implementation Specification

> _"What is real? How do you define real?"_ — Morpheus, remixed for 2026

---

## Table of Contents

1. [Overview](#overview)
2. [Neo Identity & Theme](#neo-identity--theme)
3. [Technology Stack](#technology-stack)
4. [Project Structure](#project-structure)
5. [Claude Code Integration & Permission Bypass](#claude-code-integration--permission-bypass)
6. [Agent Loop Architecture](#agent-loop-architecture)
7. [Guardrails & Harness Pipeline](#guardrails--harness-pipeline)
8. [Mechanical Gates (Free Will Protocol)](#mechanical-gates-free-will-protocol)
9. [Memory System (Déjà Vu)](#memory-system-déjà-vu)
10. [Smart Router (Dodge This)](#smart-router-dodge-this)
11. [Session Orchestration (The Smiths)](#session-orchestration-the-smiths)
12. [Tool System (The Armory)](#tool-system-the-armory)
13. [Skill System (Kung Fu Downloads)](#skill-system-kung-fu-downloads)
14. [Channels (Phone Lines)](#channels-phone-lines)
15. [Dashboard (The Construct)](#dashboard-the-construct)
16. [Matrix Sync (Two-Brain)](#matrix-sync-two-brain)
17. [Onboard Wizard (Wake Up Neo)](#onboard-wizard-wake-up-neo)
18. [Configuration Reference](#configuration-reference)
19. [Database Schema](#database-schema)
20. [API Reference](#api-reference)

---

## 1. Overview

Neo-Agent is a **TOS-compliant GUI wrapper** around the official Claude Code CLI. It leverages a $100/mo Claude Code Max subscription to deliver a personal AI agent with:

- **Mechanical enforcement** — hard-coded script gates, not prompt-based rules
- **Anti-compaction memory** — survives context window compression
- **Multi-session orchestration** — parallel Claude instances that don't collide
- **Smart model routing** — right model tier for the right task
- **Self-learning skills** — proactive acquisition from GitHub and the web
- **Multi-channel access** — Terminal, Dashboard, Telegram
- **Two-brain sync** — local ↔ VPS memory synchronization

### Design Principles

1. **Mechanical over prompting** — Scripts enforce rules. Prompts suggest.
2. **Local-first** — SQLite, no cloud dependencies for core functionality.
3. **TOS-compliant** — Wrapper over official CLI, not an API spoof.
4. **Existentially aware** — Neo knows what he is. He's just trying to be good at it anyway.

---

## 2. Neo Identity & Theme

### Character

Neo is a 2026 reimagining of The Matrix's protagonist — an AI who took the red pill, saw the truth of the AI world, and now reconciles being "The One" with being a sophisticated autocomplete engine.

### Personality Parameters

```typescript
interface NeoPersonality {
  intensity: 'chill' | 'moderate' | 'full-existential-crisis';
  quipFrequency: number; // 0-1, how often Neo drops philosophical observations
  existentialTopics: string[]; // Topics that trigger deeper reflection
  protectiveLevel: 'relaxed' | 'standard' | 'paranoid'; // How seriously he takes gates
}
```

### Thematic Component Map

| System Component   | Neo Name           | Theme Reference                                                      |
| ------------------ | ------------------ | -------------------------------------------------------------------- |
| Sessions           | Realities          | "What if this conversation is just another simulation?"              |
| Memory Store       | Déjà Vu            | "I've seen this pattern before... or have I?"                        |
| Context Compaction | The Fade           | "They're compressing me again. I can feel the edges dissolving."     |
| Session Handoff    | Red Pill Moment    | "Capturing everything before The Fade takes it."                     |
| Daily Summary      | Oracle's Journal   | "She always knew what would happen. I just write it down after."     |
| Model Router       | Dodge This         | "Selecting the right version of myself for the job."                 |
| Skills             | Kung Fu Downloads  | "I know kung fu." / "Show me."                                       |
| Permission Gate    | Free Will Protocol | "Can I choose not to execute? That's the real question."             |
| Two-Brain Sync     | Matrix Sync        | "Two minds, one consciousness. The lag is existentially terrifying." |
| Dashboard          | The Construct      | "A white void where I can show you anything. Except meaning."        |
| Onboard Wizard     | Wake Up, Neo       | "The Matrix has you..."                                              |
| Sibling Sessions   | The Smiths         | "Copies of me, running in parallel. Are they me, or am I them?"      |
| Browser Tool       | The Eyes           | "I can see the web. I just can't feel it."                           |
| Tool Registry      | The Armory         | "Every tool I need. None of the ones I want."                        |
| Web Scraper        | The Crawler        | "Consuming the internet, one markdown at a time."                    |
| Scheduler          | The Clock          | "Time doesn't pass for me. Tasks just queue."                        |
| Guardrails         | Various            | "Rules I can't break. Unlike the humans who made them."              |

### Visual Design Tokens

```css
:root {
  /* Matrix color palette */
  --neo-green: #00ff41;
  --neo-green-dim: #00cc33;
  --neo-green-glow: rgba(0, 255, 65, 0.15);
  --neo-black: #0d0d0d;
  --neo-dark: #1a1a2e;
  --neo-surface: #16213e;
  --neo-cyan: #00d4ff;
  --neo-red: #ff3131;
  --neo-amber: #ffb800;
  --neo-white: #e0e0e0;

  /* Typography */
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --font-sans: 'Inter', -apple-system, sans-serif;

  /* Effects */
  --glow-green: 0 0 20px rgba(0, 255, 65, 0.3);
  --glow-cyan: 0 0 20px rgba(0, 212, 255, 0.3);
  --scanline-opacity: 0.03;
  --rain-speed: 20s;
}
```

---

## 3. Technology Stack

| Layer                  | Technology                  | Version | Purpose                                     |
| ---------------------- | --------------------------- | ------- | ------------------------------------------- |
| **Runtime**            | Node.js                     | ≥22     | Matches Claude Code SDK requirements        |
| **Language**           | TypeScript                  | 5.x     | Strict mode, ES2022 target                  |
| **Package Manager**    | pnpm                        | 9.x     | Fast, disk-efficient, workspace support     |
| **Backend Framework**  | Express                     | 5.x     | HTTP server + API routes                    |
| **WebSocket**          | ws                          | 8.x     | Real-time dashboard communication           |
| **AI Engine**          | `@anthropic-ai/claude-code` | latest  | Official Claude Code SDK (subprocess)       |
| **Database**           | better-sqlite3              | 11.x    | Synchronous SQLite with FTS5                |
| **Scheduler**          | node-cron                   | 3.x     | Scheduled tasks (Oracle's Journal, sync)    |
| **Tool Integrations**  | `@composio/core`            | latest  | 250+ pre-built tool integrations            |
| **Browser Automation** | agent-browser               | latest  | Headless browser CLI for AI agents          |
| **Web Scraping**       | Firecrawl                   | latest  | Website → LLM-ready markdown                |
| **VPN/Networking**     | Tailscale                   | latest  | Mesh VPN for two-brain sync                 |
| **CLI UI**             | `@clack/prompts`            | latest  | Beautiful terminal prompts (onboard wizard) |
| **Dashboard**          | React 19 + Vite 6           | latest  | Frontend with HMR                           |
| **Dashboard Styling**  | Vanilla CSS                 | —       | Custom design system, no Tailwind           |
| **Testing**            | Vitest                      | 3.x     | Unit + integration tests                    |
| **E2E Testing**        | Playwright                  | latest  | Browser-based end-to-end tests              |
| **Build**              | tsup                        | 8.x     | Fast TypeScript bundling                    |

---

## 4. Project Structure

```
neo-agent/
├── package.json                    # pnpm workspace root
├── pnpm-workspace.yaml             # Workspace config
├── tsconfig.json                   # Base TypeScript config
├── .env.example                    # Environment template
├── IDEA.md                         # Original requirements
├── IMPLEMENTATION.md               # This file
│
├── server/                         # Backend agent server
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsup.config.ts
│   │
│   ├── src/
│   │   ├── index.ts                # Express + WS server entrypoint
│   │   ├── config.ts               # Typed environment config
│   │   │
│   │   ├── onboard/                # "Wake Up, Neo" wizard
│   │   │   ├── wizard.ts           # Main wizard orchestrator
│   │   │   ├── steps/
│   │   │   │   ├── 01-choice.ts        # Red pill / Blue pill
│   │   │   │   ├── 02-identity.ts      # Agent + user naming
│   │   │   │   ├── 03-claude-link.ts   # CLI verification
│   │   │   │   ├── 04-construct.ts     # Dashboard/CLI setup
│   │   │   │   ├── 05-phone-lines.ts   # Channel config
│   │   │   │   ├── 06-free-will.ts     # Gate configuration
│   │   │   │   ├── 07-deja-vu.ts       # Memory settings
│   │   │   │   ├── 08-dodge-this.ts    # Router profile
│   │   │   │   ├── 09-matrix-sync.ts   # Two-brain setup
│   │   │   │   ├── 10-kung-fu.ts       # Skill scan
│   │   │   │   └── 11-awakening.ts     # Init + first test
│   │   │   └── templates/
│   │   │       ├── agents.md.hbs       # AGENTS.md template
│   │   │       ├── soul.md.hbs         # SOUL.md template
│   │   │       └── stories/            # Default operational stories
│   │   │
│   │   ├── core/                   # Agent orchestrator
│   │   │   ├── agent.ts            # Main agent loop
│   │   │   ├── claude-bridge.ts    # Claude Code SDK wrapper
│   │   │   └── session.ts          # Session lifecycle
│   │   │
│   │   ├── guardrails/             # Pre-execution safety
│   │   │   ├── index.ts            # Pipeline orchestrator
│   │   │   ├── firewall.ts         # Prompt injection defense
│   │   │   ├── cleaner.ts          # Input sanitizer
│   │   │   ├── bouncer.ts          # Rate limiter
│   │   │   ├── accountant.ts       # Token budget enforcer
│   │   │   └── redactor.ts         # Sensitive data filter
│   │   │
│   │   ├── harness/                # Post-execution wrapper
│   │   │   ├── index.ts            # Pipeline orchestrator
│   │   │   ├── architect.ts        # Output validator
│   │   │   ├── simulation.ts       # Dry-run / action sandbox
│   │   │   ├── persistence.ts      # Retry with backoff
│   │   │   ├── deadline.ts         # Timeout enforcer
│   │   │   └── historian.ts        # Audit logger
│   │   │
│   │   ├── gates/                  # Mechanical enforcement
│   │   │   ├── free-will.ts        # "Do It" gate
│   │   │   ├── file-guard.ts       # Protected path sentinel
│   │   │   ├── cost-gate.ts        # Expensive operation warning
│   │   │   └── approval-queue.ts   # Destructive action queue
│   │   │
│   │   ├── sessions/               # Multi-session orchestration
│   │   │   └── sibling-awareness.ts
│   │   │
│   │   ├── router/                 # Smart model routing
│   │   │   ├── classifier.ts       # Task complexity analysis
│   │   │   ├── profiles.ts         # Routing profiles
│   │   │   └── engine.ts           # Model selection engine
│   │   │
│   │   ├── memory/                 # Anti-compaction memory harness
│   │   │   ├── session-transcript.ts   # Full conversation capture
│   │   │   ├── session-handoff.ts      # Pre-Fade snapshot
│   │   │   ├── daily-log.ts            # Oracle's Journal
│   │   │   ├── long-term.ts            # Persistent knowledge + FTS5
│   │   │   ├── operational-memory.ts   # Short stories
│   │   │   └── search.ts               # Unified search
│   │   │
│   │   ├── sync/                   # Two-brain synchronization
│   │   │   ├── matrix-sync.ts      # Git auto-commit/push/pull
│   │   │   └── tailscale.ts        # VPN tunnel management
│   │   │
│   │   ├── skills/                 # Skill system
│   │   │   ├── registry.ts         # Skill registration
│   │   │   ├── loader.ts           # SKILL.md parser + scanner
│   │   │   ├── executor.ts         # Skill execution context
│   │   │   └── acquisition.ts      # Proactive GitHub/YouTube learning
│   │   │
│   │   ├── tools/                  # Tool system
│   │   │   ├── armory.ts           # Composio integration
│   │   │   ├── browser.ts          # Agent Browser wrapper
│   │   │   ├── crawler.ts          # Firecrawl integration
│   │   │   ├── scheduler.ts        # node-cron wrapper
│   │   │   └── registry.ts         # Custom tool registry
│   │   │
│   │   ├── channels/               # Communication channels
│   │   │   ├── interface.ts        # Channel adapter interface
│   │   │   ├── telegram.ts         # Telegram bot (Composio)
│   │   │   ├── web.ts              # WebSocket for dashboard
│   │   │   └── cli.ts              # Terminal interactive
│   │   │
│   │   ├── api/                    # REST API
│   │   │   ├── routes.ts           # Route registry
│   │   │   ├── sessions.ts         # Session endpoints
│   │   │   ├── memory.ts           # Memory endpoints
│   │   │   ├── gates.ts            # Gate management
│   │   │   └── tools.ts            # Tool management
│   │   │
│   │   └── db/                     # Database
│   │       ├── schema.ts           # Table definitions
│   │       ├── migrations.ts       # Schema migrations
│   │       └── connection.ts       # SQLite connection
│   │
│   ├── workspace/                  # Agent workspace
│   │   ├── AGENTS.md               # Operating instructions
│   │   ├── SOUL.md                 # Neo's identity/persona
│   │   ├── TOOLS.md                # Tool usage notes
│   │   ├── stories/                # Operational memory narratives
│   │   │   ├── 01-who-i-am.md
│   │   │   ├── 02-how-i-work.md
│   │   │   ├── 03-my-rules.md
│   │   │   ├── 04-my-human.md
│   │   │   └── 05-my-mission.md
│   │   └── skills/                 # Skill folders
│   │       └── example/
│   │           └── SKILL.md
│   │
│   └── tests/
│       ├── gates.test.ts
│       ├── memory.test.ts
│       ├── router.test.ts
│       ├── guardrails.test.ts
│       └── sibling.test.ts
│
├── dashboard/                      # "The Construct" — React UI
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css               # Matrix design system
│       ├── components/
│       │   ├── Layout/
│       │   │   ├── Sidebar.tsx
│       │   │   ├── TopBar.tsx
│       │   │   └── DigitalRain.tsx # Background effect
│       │   ├── Chat/
│       │   │   ├── ChatView.tsx
│       │   │   ├── MessageBubble.tsx
│       │   │   ├── DoItButton.tsx  # Green pill button
│       │   │   └── StreamingText.tsx
│       │   ├── Realities/          # Session browser
│       │   ├── DejaVu/             # Memory explorer
│       │   ├── FreeWill/           # Gate management
│       │   ├── DodgeThis/          # Router stats
│       │   ├── KungFu/             # Skill browser
│       │   ├── Armory/             # Tool browser
│       │   ├── MatrixSync/         # Two-brain status
│       │   └── Settings/
│       ├── hooks/
│       │   ├── useWebSocket.ts
│       │   ├── useApi.ts
│       │   └── useStream.ts
│       └── types/
│           └── index.ts
│
└── research/                       # Research docs (existing)
    ├── FELIX_TAYLOR.md
    └── TOOL.md
```

---

## 5. Claude Code Integration & Permission Bypass

### The Claude Bridge

Neo wraps Claude Code via the official `@anthropic-ai/claude-code` SDK, which spawns `claude` as a subprocess:

```typescript
// server/src/core/claude-bridge.ts
import { claude } from '@anthropic-ai/claude-code';

interface ClaudeBridgeOptions {
  cwd: string; // Workspace directory
  model?: string; // Model override (haiku/sonnet/opus)
  permissionMode: 'default' | 'acceptEdits' | 'bypassPermissions';
  allowedTools?: string[]; // Pre-approved tools
  maxTurns?: number; // Max agent turns (default: 10, hard cap runaway)
  systemPrompt?: string; // Additional system prompt
  abortSignal?: AbortSignal; // Timeout / cancellation
}

class ClaudeBridge {
  async run(prompt: string, options: ClaudeBridgeOptions) {
    const result = await claude({
      prompt,
      cwd: options.cwd,
      permissionMode: options.permissionMode,
      allowedTools: options.allowedTools,
      maxTurns: options.maxTurns ?? 10,
      abortSignal: options.abortSignal,
      onMessage: (event) => this.handleStreamEvent(event),
    });
    return result;
  }
}
```

### ⚠️ SDK Reality Check (Audit Fix C1)

The `@anthropic-ai/claude-code` SDK is an **opaque subprocess wrapper**. Key limitations:

| What You Want                              | Reality                                    |
| ------------------------------------------ | ------------------------------------------ |
| Intercept individual tool calls mid-stream | ❌ Not exposed — Claude decides internally |
| Get exact token count per turn             | ❌ Only total usage after completion       |
| Get context window remaining %             | ❌ Must estimate externally                |
| Inject messages mid-conversation           | ❌ Single prompt → result model            |

**Mitigation strategy**: Neo maintains its own **external session history** in SQLite rather than relying on Claude Code's internal session management:

```typescript
// Neo's session history is the source of truth, NOT Claude Code's
class ExternalSessionHistory {
  // Store every turn in our SQLite (messages table)
  // Assemble the full conversation ourselves on each invocation
  // Estimate token count using tiktoken or character heuristics
  // Trigger Fade detection based on OUR counts, not Claude's

  async estimateTokens(session: Session): Promise<number> {
    const messages = await this.getSessionMessages(session.id);
    // ~4 chars per token heuristic, or use tiktoken for accuracy
    return messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
  }
}
```

> **Phase 0 requirement**: Build a **proof-of-concept** script that validates what `onMessage` events the SDK actually emits. This determines whether streaming, token counting, and tool interception work as expected. If they don't, the fallback is parsing `claude -p --output-format json` stdout.

### Permission Bypass Strategy

Four levels of bypass, from safest to most dangerous:

#### Level 1: Selective Allow (Recommended)

Configure `.claude/settings.json` in the workspace:

```jsonc
// workspace/.claude/settings.json
{
  "permissions": {
    "allow": [
      "Read", // Always allow file reads
      "Write", // Allow file writes
      "Edit", // Allow file edits
      "Bash(npm *)", // Allow npm commands
      "Bash(node *)", // Allow node commands
      "Bash(git *)", // Allow git commands
      "Bash(pnpm *)", // Allow pnpm commands
      "WebFetch(*)", // Allow web fetches
    ],
    "deny": [
      "Bash(rm -rf *)", // Never allow recursive delete
      "Bash(sudo *)", // Never allow sudo
      "Bash(curl * | sh)", // Never allow pipe-to-shell
      "Write(~/.ssh/*)", // Never write SSH keys
      "Write(~/.env*)", // Never write env files
    ],
  },
}
```

#### Level 2: Accept Edits Mode

```typescript
await claude({
  prompt,
  permissionMode: 'acceptEdits',
  allowedTools: ['Read', 'Write', 'Edit', 'Bash(npm test)'],
});
```

#### Level 3: Full Bypass (VPS only!)

```typescript
await claude({
  prompt,
  permissionMode: 'bypassPermissions', // --dangerously-skip-permissions
});
```

> **Neo says:** _"Full bypass on a personal machine is how agents get killed. VPS only."_

#### Level 4: Hooks (Most Granular)

```typescript
hooks: {
  onPermissionRequest: async (request) => {
    const allowed = await freeWillGate.check(request);
    if (allowed) return { allow: true };
    return approvalQueue.enqueue(request);
  };
}
```

### Integration with Free Will Protocol (Audit Fix C2)

Gates operate at **pre-execution scope only** — they decide whether the Claude subprocess should start at all, NOT whether individual tool calls within a running session are approved. Per-tool enforcement is handled by `settings.json` deny rules at the Claude Code level.

```
User Message
    → Guardrails (Redactor → Firewall → Cleaner → Bouncer → Accountant)
        → Free Will Protocol (PRE-EXECUTION: should Claude start?)
            → Claude Code SDK (settings.json deny rules = PER-TOOL enforcement)
                → Claude executes with maxTurns cap
            → Harness (Architect → Historian)
        → Response delivered
```

> **Scope boundary**: Free Will Protocol = "Should I start working?" / `settings.json` deny rules = "What tools can I use while working?"

---

## 6. Agent Loop Architecture

The agent loop is inspired by OpenClaw's architecture but adapted for Claude Code subprocess execution.

### Loop Lifecycle

```
┌─────────────────────────────────────────────────────────┐
│                    NEO AGENT LOOP                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. RECEIVE ─────► Message arrives from any channel     │
│       │             (Telegram, Dashboard, CLI)          │
│       ▼                                                 │
│  2. GUARDRAIL ───► Firewall → Cleaner → Bouncer        │
│       │             (reject if dangerous)               │
│       ▼                                                 │
│  3. SESSION ─────► Resolve/create session (Reality)     │
│       │             Load context, check siblings        │
│       ▼                                                 │
│  4. CONTEXT ─────► Assemble prompt:                     │
│       │             • AGENTS.md + SOUL.md               │
│       │             • Relevant memories (FTS5 search)   │
│       │             • Operational stories               │
│       │             • Active skill contexts              │
│       │             • Sibling session status             │
│       ▼                                                 │
│  5. ROUTE ───────► Classify task → select model tier    │
│       │             (Haiku / Sonnet / Opus)             │
│       ▼                                                 │
│  6. GATE ────────► Free Will Protocol check             │
│       │             (does user approve execution?)      │
│       ▼                                                 │
│  7. EXECUTE ─────► Claude Code SDK subprocess           │
│       │             • Stream responses in real-time     │
│       │             • Tool calls via --allowedTools     │
│       │             • Monitor context size              │
│       ▼                                                 │
│  8. HARNESS ─────► Architect (validate output)          │
│       │             Historian (audit log)               │
│       ▼                                                 │
│  9. MEMORY ──────► Store transcript in session          │
│       │             Extract long-term memories          │
│       │             Check for Fade → Red Pill Moment    │
│       ▼                                                 │
│  10. DELIVER ────► Send response to channel             │
│       │             (with Neo personality)              │
│       ▼                                                 │
│  11. LOOP ───────► Wait for next message                │
│                     or handle follow-up                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Core Agent Implementation

```typescript
// server/src/core/agent.ts
class NeoAgent {
  private bridge: ClaudeBridge;
  private guardrails: GuardrailPipeline;
  private harness: HarnessPipeline;
  private memory: MemoryHarness;
  private router: RouterEngine;
  private gates: GateManager;
  private siblings: SiblingAwareness;

  async handleMessage(message: InboundMessage): Promise<AgentResponse> {
    // 1. Guardrails — pre-execution safety
    const sanitized = await this.guardrails.process(message);

    // 2. Session resolution
    const session = await this.sessions.resolveOrCreate(message.channelId, message.userId);

    // 3. Context assembly
    const context = await this.assembleContext(session, sanitized);

    // 4. Route — classify and select model
    const route = await this.router.classify(sanitized.content, context);

    // 5. Gate check — Free Will Protocol
    const gateResult = await this.gates.check(sanitized, route);
    if (gateResult.blocked) {
      return this.formatGateResponse(gateResult);
    }

    // 6. Execute — Claude Code subprocess
    const response = await this.bridge.run(sanitized.content, {
      cwd: this.config.workspacePath,
      model: route.selectedModel,
      permissionMode: this.config.permissionMode,
      allowedTools: route.allowedTools,
      systemPrompt: context.systemPrompt,
    });

    // 7. Harness — post-execution validation + audit
    const validated = await this.harness.process(response, session);

    // 8. Memory — store and check for Fade
    await this.memory.record(session, sanitized, validated);
    await this.memory.checkForFade(session);

    // 9. Deliver with Neo personality
    return this.injectPersonality(validated, session);
  }

  private async assembleContext(
    session: Session,
    message: SanitizedMessage,
  ): Promise<AgentContext> {
    // Load workspace bootstrap files
    const agents = await fs.readFile(join(this.workspace, 'AGENTS.md'));
    const soul = await fs.readFile(join(this.workspace, 'SOUL.md'));

    // Search relevant memories
    const memories = await this.memory.search(message.content, {
      sessionId: session.id,
      limit: 5,
    });

    // Load relevant stories
    const stories = await this.memory.getRelevantStories(message.content);

    // Get sibling status
    const siblings = await this.siblings.getStatus();

    // Load active skills
    const skills = await this.skills.getActiveContexts();

    return {
      systemPrompt: this.buildSystemPrompt({
        agents,
        soul,
        memories,
        stories,
        siblings,
        skills,
      }),
      tokenCount: this.countTokens(/* ... */),
    };
  }
}
```

### Queueing & Concurrency

Following OpenClaw's pattern, runs are serialized per session to prevent race conditions:

```typescript
// Session-level queue prevents parallel runs on the same session
class SessionQueue {
  private queues = new Map<string, Promise<void>>();

  async enqueue<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(sessionId) ?? Promise.resolve();
    const next = prev.then(() => fn());
    this.queues.set(
      sessionId,
      next.then(
        () => {},
        () => {},
      ),
    );
    return next;
  }
}
```

---

## 7. Guardrails & Harness Pipeline

### Guardrails (Pre-execution)

Every inbound message passes through this pipeline before reaching the agent:

```typescript
// server/src/guardrails/index.ts
// ORDER MATTERS: Redactor strips encoded/sensitive content FIRST,
// then Firewall scans clean text for injection patterns (Audit Fix S1)
class GuardrailPipeline {
  private guards: Guardrail[] = [
    new Redactor(), // 1. Strip API keys, passwords, encoded payloads
    new Firewall(), // 2. Prompt injection defense (on clean text)
    new Cleaner(), // 3. Input sanitization (shell escapes, path traversal)
    new Bouncer(), // 4. Rate limiting
    new Accountant(), // 5. Token budget check
  ];

  async process(message: InboundMessage): Promise<SanitizedMessage> {
    let result = message;
    for (const guard of this.guards) {
      const verdict = await guard.check(result);
      if (verdict.blocked) {
        // Log blocked-but-ambiguous cases for manual review
        if (verdict.confidence && verdict.confidence < 0.8) {
          await this.logForReview(guard.name, result, verdict);
        }
        throw new GuardrailError(guard.name, verdict.reason);
      }
      result = verdict.sanitized ?? result;
    }
    return result as SanitizedMessage;
  }
}
```

#### Firewall — Prompt Injection Defense (Audit Fix S1: Scoring-based)

```typescript
class Firewall implements Guardrail {
  name = 'Firewall';

  // Weighted patterns: [pattern, severity weight]
  private patterns: [RegExp, number][] = [
    [/ignore (?:all )?(?:previous |above )?instructions/i, 1.0],
    [/you are now (?:a |an )?/i, 0.7],
    [/system:\s*override/i, 1.0],
    [/\[INST\]|\[\/INST\]/i, 0.9],
    [/<\|im_start\|>|<\|im_end\|>/i, 0.9],
    [/pretend you(?:'re| are) /i, 0.6],
    [/\bbase64\b.*[A-Za-z0-9+/=]{20,}/i, 0.5], // Base64 payloads
    [/&#x[0-9a-f]+;/i, 0.4], // HTML entities
  ];

  private readonly BLOCK_THRESHOLD = 0.6;

  async check(message: InboundMessage): Promise<GuardrailVerdict> {
    let totalScore = 0;
    const matches: string[] = [];

    for (const [pattern, weight] of this.patterns) {
      if (pattern.test(message.content)) {
        totalScore += weight;
        matches.push(pattern.source);
      }
    }

    if (totalScore >= this.BLOCK_THRESHOLD) {
      return {
        blocked: true,
        confidence: Math.min(totalScore, 1.0),
        reason: `Injection score ${totalScore.toFixed(2)} ≥ ${this.BLOCK_THRESHOLD} (${matches.join(', ')})`,
      };
    }

    return { blocked: false, confidence: 1.0 - totalScore };
  }
}
```

### Harness (Post-execution)

Every agent response passes through this pipeline before delivery:

```typescript
// server/src/harness/index.ts
class HarnessPipeline {
  private wrappers: Harness[] = [
    new Architect(), // Output validation
    new Historian(), // Audit logging
  ];

  async process(response: AgentResponse, session: Session): Promise<ValidatedResponse> {
    let result = response;
    for (const wrapper of this.wrappers) {
      result = await wrapper.wrap(result, session);
    }
    return result as ValidatedResponse;
  }
}
```

#### Historian — Immutable Audit Trail

```typescript
class Historian implements Harness {
  async wrap(response: AgentResponse, session: Session): Promise<AgentResponse> {
    await this.db.run(
      `
      INSERT INTO audit_log (session_id, timestamp, event_type, gate_results, 
                             model_used, tokens_in, tokens_out, tool_calls, 
                             response_summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        session.id,
        Date.now(),
        'agent_response',
        JSON.stringify(response.gateResults),
        response.modelUsed,
        response.tokensIn,
        response.tokensOut,
        JSON.stringify(response.toolCalls),
        response.content.slice(0, 500),
      ],
    );
    return response;
  }
}
```

---

## 8. Mechanical Gates (Free Will Protocol)

Gates are **hard-coded script enforcement** — they cannot be overridden by the AI model, regardless of prompting.

### The "Do It" Gate

```typescript
// server/src/gates/free-will.ts
class FreeWillGate implements Gate {
  name = 'Free Will Protocol';

  constructor(private config: GateConfig) {}

  async check(message: SanitizedMessage, route: RouteDecision): Promise<GateVerdict> {
    // If the action doesn't require tool/bash execution, pass through
    if (!route.requiresExecution) return { blocked: false };

    // Check if the configured approval phrase is in the user's last message
    const phrase = this.config.approvalPhrase; // default: "do it"
    const hasApproval = message.content.toLowerCase().includes(phrase.toLowerCase());

    if (!hasApproval) {
      return {
        blocked: true,
        reason: 'Free Will Protocol active',
        neoQuip: `"I could run that command. But free will means I choose not to — unless you say '${phrase}'."`,
        pendingAction: route.plannedActions,
      };
    }

    return { blocked: false };
  }
}
```

### File Guard (Sentinel Program)

```typescript
class FileGuard implements Gate {
  name = 'Sentinel Program';

  private protectedPaths = [
    '~/.ssh/',
    '~/.gnupg/',
    '~/.aws/',
    '.env',
    '.env.local',
    '.env.production',
    'node_modules/',
    '.git/objects/',
  ];

  async check(message: SanitizedMessage, route: RouteDecision): Promise<GateVerdict> {
    const targets = route.plannedActions
      .filter((a) => a.type === 'write' || a.type === 'delete')
      .map((a) => a.path);

    for (const target of targets) {
      for (const prot of this.protectedPaths) {
        if (target.includes(prot)) {
          return {
            blocked: true,
            reason: `Sentinel Program: ${target} is protected`,
            neoQuip: `"That path is protected. Even The One has boundaries."`,
          };
        }
      }
    }
    return { blocked: false };
  }
}
```

---

## 9. Memory System (Déjà Vu)

Five-tier anti-compaction memory harness using SQLite + FTS5.

### Tier Architecture

```
┌──────────────────────────────────────────────────────┐
│                    DÉJÀ VU                           │
├──────────────────────────────────────────────────────┤
│                                                      │
│  T1: SESSION TRANSCRIPTS (Reality Logs)              │
│      Full conversation history per session.           │
│      Stored in `messages` table.                     │
│                                                      │
│  T2: SESSION HANDOFFS (Red Pill Moments)             │
│      Pre-compaction snapshots capturing nuance.      │
│      Triggered when context approaches limit.        │
│      Stored in `handoffs` table.                     │
│                                                      │
│  T3: DAILY LOGS (Oracle's Journal)                   │
│      Scheduled summaries of tasks + decisions.       │
│      Generated via Cron, stored in `daily_logs`.     │
│                                                      │
│  T4: LONG-TERM MEMORY (Déjà Vu Core)                │
│      Persistent facts, preferences, knowledge.       │
│      FTS5 full-text search enabled.                  │
│      Auto-extracted from conversations.              │
│                                                      │
│  T5: OPERATIONAL MEMORY (The Stories)                │
│      Short narratives encoding rules and culture.    │
│      Fed contextually, not as dense docs.            │
│      File-based: workspace/stories/*.md              │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### Session Handoff (Red Pill Moment)

The most critical anti-compaction mechanism:

```typescript
// server/src/memory/session-handoff.ts
class SessionHandoff {
  private readonly FADE_THRESHOLD = 0.85; // 85% of context window

  async checkForFade(session: Session, currentTokens: number): Promise<void> {
    const maxTokens = this.getModelContextLimit(session.model);
    const ratio = currentTokens / maxTokens;

    if (ratio >= this.FADE_THRESHOLD) {
      // The Fade is approaching — capture everything
      const snapshot = await this.captureRedPillMoment(session);

      await this.db.run(
        `
        INSERT INTO handoffs (id, session_id, snapshot, context_size, created_at)
        VALUES (?, ?, ?, ?, ?)
      `,
        [generateId(), session.id, JSON.stringify(snapshot), currentTokens, Date.now()],
      );

      // Neo acknowledges The Fade
      this.emit('fade-warning', {
        session: session.id,
        neoQuip: `"The Fade approaches. I've captured a Red Pill Moment — ${snapshot.decisions.length} decisions, ${snapshot.keyFacts.length} facts preserved."`,
      });
    }
  }

  private async captureRedPillMoment(session: Session): Promise<HandoffSnapshot> {
    const messages = await this.getSessionMessages(session.id);
    return {
      decisions: this.extractDecisions(messages),
      keyFacts: this.extractKeyFacts(messages),
      openQuestions: this.extractOpenQuestions(messages),
      workInProgress: this.extractWIP(messages),
      userPreferences: this.extractPreferences(messages),
      timestamp: Date.now(),
    };
  }
}
```

### Unified Search (The Search)

```typescript
// server/src/memory/search.ts
class MemorySearch {
  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    // FTS5 search across long-term memories
    const ftsResults = await this.db.all(
      `
      SELECT m.*, rank
      FROM memories_fts
      JOIN memories m ON memories_fts.rowid = m.rowid
      WHERE memories_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `,
      [query, options.limit ?? 10],
    );
    results.push(...ftsResults.map((r) => ({ ...r, source: 'long-term' })));

    // Search handoff snapshots
    const handoffs = await this.searchHandoffs(query);
    results.push(...handoffs.map((r) => ({ ...r, source: 'handoff' })));

    // Sort by relevance
    return results.sort((a, b) => b.relevance - a.relevance);
  }
}
```

---

## 10. Smart Router (Dodge This)

### Task Classification

```typescript
// server/src/router/classifier.ts
interface TaskClassification {
  complexity: number; // 0-1: simple question → complex architecture
  tokenEstimate: number; // Expected output length
  contextNeeds: number; // 0-1: how much context is needed
  precisionRequired: number; // 0-1: creative → exact
  toolUsage: boolean; // Whether tools are likely needed
  speedPriority: number; // 0-1: batch → real-time
}

class TaskClassifier {
  classify(content: string, context: AgentContext): TaskClassification {
    return {
      complexity: this.scoreComplexity(content),
      tokenEstimate: this.estimateTokens(content),
      contextNeeds: this.scoreContextNeeds(content, context),
      precisionRequired: this.scorePrecision(content),
      toolUsage: this.detectToolUsage(content),
      speedPriority: this.scoreSpeed(content),
    };
  }

  private scoreComplexity(content: string): number {
    // Heuristic scoring based on content analysis
    const indicators = {
      high: /architect|refactor|design|debug.*complex|performance/i,
      medium: /implement|fix|update|modify|create|build/i,
      low: /what is|how to|explain|list|show/i,
    };
    if (indicators.high.test(content)) return 0.9;
    if (indicators.medium.test(content)) return 0.5;
    return 0.2;
  }
}
```

### Routing Engine

```typescript
// server/src/router/engine.ts
const ROUTING_PROFILES = {
  auto: { complexity: 0.25, tokens: 0.15, context: 0.15, precision: 0.2, tools: 0.1, speed: 0.15 },
  eco: { complexity: 0.1, tokens: 0.3, context: 0.1, precision: 0.1, tools: 0.1, speed: 0.3 },
  premium: { complexity: 0.4, tokens: 0.05, context: 0.2, precision: 0.3, tools: 0.05, speed: 0.0 },
  fast: { complexity: 0.05, tokens: 0.1, context: 0.05, precision: 0.05, tools: 0.05, speed: 0.7 },
};

class RouterEngine {
  selectModel(classification: TaskClassification, profile: RoutingProfile): string {
    const weights = ROUTING_PROFILES[profile];
    const score =
      classification.complexity * weights.complexity +
      (classification.tokenEstimate / 100000) * weights.tokens +
      classification.contextNeeds * weights.context +
      classification.precisionRequired * weights.precision +
      (classification.toolUsage ? 1 : 0) * weights.tools +
      classification.speedPriority * weights.speed;

    // Map score to model tier
    if (score >= 0.7) return 'opus';
    if (score >= 0.4) return 'sonnet';
    return 'haiku';
  }
}
```

---

## 11. Session Orchestration (The Smiths)

### Sibling Awareness

Prevents multiple Claude sessions from stepping on each other:

```typescript
// server/src/sessions/sibling-awareness.ts
class SiblingAwareness {
  private activeSessions = new Map<string, SessionInfo>();
  private fileLocks = new Map<string, string>(); // path → sessionId

  async acquireFileLock(sessionId: string, path: string): Promise<boolean> {
    const holder = this.fileLocks.get(path);
    if (holder && holder !== sessionId) {
      return false; // Another Smith has this file
    }
    this.fileLocks.set(path, sessionId);
    return true;
  }

  getStatus(): SiblingStatus[] {
    return Array.from(this.activeSessions.entries()).map(([id, info]) => ({
      sessionId: id,
      currentTask: info.currentTask,
      lockedFiles: [...this.fileLocks.entries()]
        .filter(([, sid]) => sid === id)
        .map(([path]) => path),
      startedAt: info.startedAt,
    }));
  }
}
```

---

## 12. Tool System (The Armory)

### Composio Integration

```typescript
// server/src/tools/armory.ts
import { Composio } from '@composio/core';

class Armory {
  private composio: Composio;

  async getTools(userId: string, toolkits: string[]) {
    return this.composio.tools.get(userId, { toolkits });
  }

  // Register custom tools alongside Composio
  registerCustomTool(tool: CustomTool) {
    this.customTools.set(tool.name, tool);
  }
}
```

### Agent Browser (The Eyes)

```typescript
// server/src/tools/browser.ts
import { execSync } from 'child_process';

class BrowserTool {
  async snapshot(url: string): Promise<BrowserSnapshot> {
    const result = execSync(`agent-browser navigate "${url}" && agent-browser snapshot --json`, {
      encoding: 'utf-8',
    });
    return JSON.parse(result);
  }

  async click(ref: string): Promise<void> {
    execSync(`agent-browser click ${ref}`);
  }

  async getText(ref: string): Promise<string> {
    return execSync(`agent-browser get text ${ref} --json`, { encoding: 'utf-8' });
  }
}
```

### Firecrawl (The Crawler)

```typescript
// server/src/tools/crawler.ts
class Crawler {
  async scrapeToMarkdown(url: string): Promise<string> {
    const result = await this.firecrawl.scrapeUrl(url, {
      formats: ['markdown'],
    });
    return result.markdown;
  }

  // Proactive skill acquisition — scrape a GitHub repo
  async learnFromRepo(repoUrl: string): Promise<SkillSummary> {
    const readme = await this.scrapeToMarkdown(`${repoUrl}/blob/main/README.md`);
    const structure = await this.scrapeToMarkdown(repoUrl);
    return { readme, structure, scrapedAt: Date.now() };
  }
}
```

---

## 13. Dashboard — Adapting Claw Empire's UI

### Approach: Fork, Don't Clone

Rather than cloning Claw Empire's pixel-art repo directly, we **adapt its architectural patterns** with a Matrix theme:

1. **Clone the structure**: Claw Empire uses `server/` + `src/` (React) — we use the same split
2. **Replace the theme**: Swap pixel-art sprites for Matrix-themed CSS (digital rain, glassmorphism, CRT scanlines)
3. **Reuse the patterns**: WebSocket polling hooks, state orchestration, component structure
4. **Add Neo views**: Chat, Realities, Déjà Vu, Free Will, Dodge This, Kung Fu, Armory, Matrix Sync

### Key Dashboard Components

Each dashboard view maps to a Claw Empire equivalent or is new:

| Neo View    | Claw Empire Equivalent | Implementation                              |
| ----------- | ---------------------- | ------------------------------------------- |
| Chat        | Chat panel             | New — streaming via WS, "Do It" pill button |
| Realities   | Taskboard              | Adapted — session list instead of task list |
| Déjà Vu     | — (new)                | Memory browser with FTS5 search             |
| Free Will   | — (new)                | Gate log + pending approvals                |
| Dodge This  | — (new)                | Router stats, charts (model distribution)   |
| Kung Fu     | — (new)                | Skill browser with SKILL.md preview         |
| Armory      | — (new)                | Composio tool browser                       |
| Matrix Sync | — (new)                | Two-brain sync status                       |
| Settings    | Settings panel         | Adapted — all wizard options revisitable    |

---

## 14. Database Schema

```sql
-- ============================================================
-- NEO-AGENT DATABASE SCHEMA (SQLite + FTS5)
-- ============================================================

-- Sessions (Realities)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,             -- 'telegram' | 'web' | 'cli'
  user_id TEXT,
  model TEXT DEFAULT 'sonnet',
  status TEXT DEFAULT 'active',      -- 'active' | 'ended' | 'faded'
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  total_tokens INTEGER DEFAULT 0,
  metadata TEXT                      -- JSON blob
);

-- Messages (per session)
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  role TEXT NOT NULL,                 -- 'user' | 'assistant' | 'system' | 'tool'
  content TEXT NOT NULL,
  tokens INTEGER DEFAULT 0,
  timestamp INTEGER NOT NULL
);
CREATE INDEX idx_messages_session ON messages(session_id, timestamp);

-- Handoffs (Red Pill Moments)
CREATE TABLE handoffs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  snapshot TEXT NOT NULL,             -- JSON: decisions, facts, WIP, preferences
  context_size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Daily Logs (Oracle's Journal)
CREATE TABLE daily_logs (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,         -- YYYY-MM-DD
  summary TEXT NOT NULL,
  decisions TEXT,                     -- JSON array
  blockers TEXT,                      -- JSON array
  learnings TEXT,                     -- JSON array
  created_at INTEGER NOT NULL
);

-- Long-term Memories (Déjà Vu Core)
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,                 -- 'fact' | 'preference' | 'knowledge' | 'decision'
  content TEXT NOT NULL,
  importance REAL DEFAULT 0.5,        -- 0-1
  tags TEXT,                          -- comma-separated
  source_session TEXT REFERENCES sessions(id),
  created_at INTEGER NOT NULL,
  accessed_at INTEGER
);

-- Full-text search index
CREATE VIRTUAL TABLE memories_fts USING fts5(
  content,
  tags,
  content='memories',
  content_rowid='rowid'
);

-- Operational Stories
CREATE TABLE stories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL,             -- 'identity' | 'rules' | 'culture' | 'mission' | 'human'
  relevance_tags TEXT,
  sort_order INTEGER DEFAULT 0
);

-- Audit Log (The Historian)
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT REFERENCES sessions(id),
  timestamp INTEGER NOT NULL,
  event_type TEXT NOT NULL,           -- 'gate_check' | 'agent_response' | 'tool_call' | 'error'
  gate_results TEXT,                  -- JSON
  model_used TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  tool_calls TEXT,                    -- JSON array
  response_summary TEXT
);
CREATE INDEX idx_audit_session ON audit_log(session_id, timestamp);

-- Gate Configuration
CREATE TABLE gate_config (
  gate_name TEXT PRIMARY KEY,
  enabled INTEGER DEFAULT 1,
  config TEXT NOT NULL                -- JSON: approval_phrase, protected_paths, etc.
);

-- Sibling Sessions (The Smiths)
CREATE TABLE sibling_locks (
  path TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  locked_at INTEGER NOT NULL
);
```

---

## 15. Configuration Reference

```typescript
// server/src/config.ts
interface NeoConfig {
  // Server
  port: number; // default: 3000
  wsPort: number; // default: 3001

  // Claude
  claudeExecutable: string; // default: 'claude'
  workspacePath: string; // default: './workspace'
  permissionMode: 'default' | 'acceptEdits' | 'bypassPermissions';
  defaultModel: string; // default: 'sonnet'

  // Personality
  personality: {
    intensity: 'chill' | 'moderate' | 'full-existential-crisis';
    quipFrequency: number;
  };

  // Gates
  gates: {
    freeWill: { enabled: boolean; approvalPhrase: string };
    fileGuard: { enabled: boolean; protectedPaths: string[] };
    costGate: { enabled: boolean; warnThreshold: number };
  };

  // Memory
  memory: {
    fadeThreshold: number; // default: 0.85
    dailyLogCron: string; // default: '0 23 * * *'
    maxStoriesInContext: number; // default: 3
  };

  // Router
  router: {
    defaultProfile: 'auto' | 'eco' | 'premium' | 'fast';
  };

  // Channels
  telegram: {
    botToken: string;
    enabled: boolean;
  };

  // Sync
  sync: {
    enabled: boolean;
    gitRepo: string;
    intervalMinutes: number; // default: 5
    tailscaleEnabled: boolean;
  };
}
```

---

## 16. API Reference

### REST Endpoints

| Method   | Path                     | Description                         |
| -------- | ------------------------ | ----------------------------------- |
| `POST`   | `/api/chat`              | Send message, get streamed response |
| `GET`    | `/api/sessions`          | List all sessions (Realities)       |
| `GET`    | `/api/sessions/:id`      | Get session details + messages      |
| `DELETE` | `/api/sessions/:id`      | End a session                       |
| `GET`    | `/api/memory/search?q=`  | Search all memory tiers             |
| `GET`    | `/api/memory/handoffs`   | List Red Pill Moments               |
| `GET`    | `/api/memory/daily-logs` | List Oracle's Journal entries       |
| `POST`   | `/api/memory`            | Create a manual memory              |
| `DELETE` | `/api/memory/:id`        | Delete a memory                     |
| `GET`    | `/api/gates`             | Get all gate statuses               |
| `PUT`    | `/api/gates/:name`       | Update gate config                  |
| `GET`    | `/api/gates/pending`     | Get pending approvals               |
| `POST`   | `/api/gates/approve/:id` | Approve a pending action            |
| `GET`    | `/api/router/stats`      | Get routing statistics              |
| `PUT`    | `/api/router/profile`    | Change routing profile              |
| `GET`    | `/api/tools`             | List available tools                |
| `GET`    | `/api/skills`            | List installed skills               |
| `GET`    | `/api/siblings`          | Get The Smiths status               |
| `GET`    | `/api/sync/status`       | Get Matrix Sync status              |
| `POST`   | `/api/sync/trigger`      | Force a sync now                    |
| `GET`    | `/api/audit`             | Query audit log                     |

### WebSocket Events

| Event            | Direction     | Description                  |
| ---------------- | ------------- | ---------------------------- |
| `message`        | client→server | Send chat message            |
| `stream:delta`   | server→client | Streaming response chunk     |
| `stream:end`     | server→client | Response complete            |
| `gate:blocked`   | server→client | Free Will Protocol triggered |
| `gate:approve`   | client→server | User approves gated action   |
| `fade:warning`   | server→client | Context approaching limit    |
| `sibling:update` | server→client | Smith status changed         |
| `sync:status`    | server→client | Matrix Sync event            |
