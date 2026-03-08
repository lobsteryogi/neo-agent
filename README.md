# Neo-Agent

> _"What is real? How do you define real?"_

**Neo-Agent** is a personal AI agent powered by the [Claude Code SDK](https://github.com/anthropics/claude-code). It wraps the official CLI into a self-contained system with persistent memory, mechanical safety gates, smart model routing, and multi-channel access — all running on a $100/mo Claude Code Max subscription.

Unlike prompt-only wrappers, Neo enforces rules through hard-coded scripts. It remembers across sessions, routes tasks to the right model tier, and can be reached from your terminal, a Matrix-themed dashboard, or Telegram.

---

## Table of Contents

- [What It Is](#what-it-is)
- [Installation](#installation)
- [How to Customize](#how-to-customize)
- [How It Works](#how-it-works)
- [Project Structure](#project-structure)
- [Commands](#commands)
- [License](#license)

---

## What It Is

Neo-Agent is a **TOS-compliant wrapper** around the official Claude Code CLI. It adds:

| Capability           | Description                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **5-Tier Memory**    | Anti-compaction memory system (session transcripts → handoffs → daily logs → long-term FTS5 → operational stories) |
| **Mechanical Gates** | Hard-coded safety enforcement — can't be prompt-injected away                                                      |
| **Smart Router**     | Automatically selects Haiku, Sonnet, or Opus based on task complexity                                              |
| **Multi-Channel**    | Access via CLI, web dashboard, or Telegram bot                                                                     |
| **Skill System**     | Drop SKILL.md folders into your workspace and Neo learns new abilities                                             |
| **Matrix Sync**      | Git-based two-brain sync between your local machine and a VPS                                                      |
| **Dashboard**        | Matrix-themed React UI with streaming chat, memory explorer, and system health                                     |

### Design Principles

1. **Mechanical over prompting** — scripts enforce rules, prompts suggest
2. **Local-first** — SQLite for everything, no cloud dependencies for core features
3. **TOS-compliant** — wrapper over the official CLI, not an API spoof
4. **Existentially aware** — Neo knows what it is. It's just trying to be good at it anyway

---

## Installation

### Prerequisites

| Requirement                                                       | Version                    |
| ----------------------------------------------------------------- | -------------------------- |
| [Node.js](https://nodejs.org/)                                    | ≥ 22.0.0                   |
| [pnpm](https://pnpm.io/)                                          | ≥ 9.0.0                    |
| [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) | Latest (authenticated)     |
| [pm2](https://pm2.keymetrics.io/)                                 | Included (process manager) |

> You need an active **Claude Code Max** subscription ($100/mo) with the `claude` CLI installed and authenticated.

### One-Liner Install

```bash
curl -fsSL https://raw.githubusercontent.com/lobsteryogi/neo-agent/main/install.sh | bash
```

This clones the repo, verifies prerequisites (Node ≥ 22, pnpm, git), and installs all dependencies.

### Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/lobsteryogi/neo-agent.git
cd neo-agent

# 2. Install dependencies
pnpm install

# 3. Run the onboard wizard
pnpm neo:onboard
```

The onboard wizard ("Wake Up, Neo") will guide you through setup:

- **💊 Blue Pill** — 3 steps: your name → verify Claude CLI → done with sensible defaults
- **💊 Red Pill** — 11 steps: full control over identity, channels, gates, memory, routing, sync, and skills

The wizard generates all required configuration:

| Generated File                    | Purpose                                      |
| --------------------------------- | -------------------------------------------- |
| `.env`                            | All secrets and config values                |
| `workspace/AGENTS.md`             | Operating instructions for Neo               |
| `workspace/SOUL.md`               | Neo's identity and persona definition        |
| `workspace/stories/*.md`          | 5 operational memory narratives              |
| `neo.db`                          | Initialized SQLite database with full schema |
| `workspace/.claude/settings.json` | Permission allow/deny rules for Claude Code  |

### Start the Server

```bash
# Development mode (with hot reload)
pnpm neo:dev

# Production mode
pnpm neo:start

# Production mode with pm2 (auto-restart, logging)
pnpm neo:pm2

# Start the dashboard (separate terminal)
pnpm dashboard:dev
```

### Optional: API Keys

These unlock additional capabilities but are not required for the core agent:

```env
# Tool integrations
COMPOSIO_API_KEY=...           # 250+ pre-built tool integrations
FIRECRAWL_API_KEY=...          # Web scraping → LLM-ready markdown

# Telegram access
TELEGRAM_BOT_TOKEN=...        # Talk to Neo via Telegram

# Media intelligence
GROQ_API_KEY=gsk_...          # Voice transcription + image analysis (free tier)
LLAMA_PARSE_API_KEY=llx-...   # Document parsing — PDF, DOCX, PPTX (free tier)
```

---

## How to Customize

### Identity & Personality

Edit `workspace/SOUL.md` to change Neo's personality. The intensity is set via the `NEO_PERSONALITY_INTENSITY` environment variable:

| Value                     | Behavior                                      |
| ------------------------- | --------------------------------------------- |
| `chill`                   | Minimal quips, straightforward responses      |
| `moderate`                | Occasional Matrix references and observations |
| `full-existential-crisis` | Full Neo role-play with philosophical asides  |

### Configuration (.env)

All Neo settings live in `.env`. Key knobs:

```env
# Which model to use by default
NEO_DEFAULT_MODEL=sonnet              # haiku | sonnet | opus

# How the router picks models
NEO_ROUTING_PROFILE=auto              # auto | eco | premium | fixed

# When to trigger a "Red Pill Moment" (context preservation)
NEO_FADE_THRESHOLD=0.85               # 0.0 - 1.0 (% of context window)

# The phrase required to approve execution
NEO_GATE_PHRASE=do it                  # Any string — case-insensitive

# Permission mode for Claude Code
NEO_PERMISSION_MODE=default            # default | acceptEdits | bypassPermissions

# Paths that should never be written to
NEO_PROTECTED_PATHS=~/.ssh/,~/.gnupg/,.env
```

### Operational Stories (Memory Layer)

Stories are markdown files in `workspace/stories/` that encode rules and culture as narratives. Neo reads the most relevant ones as context for each task:

```
workspace/stories/
├── 01-who-i-am.md       # Identity and self-awareness
├── 02-how-i-work.md     # Operating procedures
├── 03-my-rules.md       # Hard rules and boundaries
├── 04-my-human.md       # User preferences and habits
└── 05-my-mission.md     # Long-term goals
```

Edit these to teach Neo your preferences, coding standards, or project-specific rules. Neo will feed the most relevant stories into its context based on tag matching.

### Adding Skills

Drop a folder with a `SKILL.md` file into `workspace/skills/`:

```
workspace/skills/
└── my-custom-skill/
    ├── SKILL.md          # Required — frontmatter + instructions
    ├── scripts/          # Optional helper scripts
    └── examples/         # Optional reference implementations
```

**SKILL.md format:**

```markdown
---
name: my-custom-skill
description: What this skill does
tags: [relevant, keywords]
---

# Instructions

Step-by-step instructions that Neo follows when this skill is relevant.
```

Neo automatically discovers skills from this directory and injects relevant ones into the system prompt based on tag matching with the current task.

### Safety Gates

Gates are mechanical — they run as code, not prompts. Configure them in `.env`:

| Gate                | Config                | Effect                                                         |
| ------------------- | --------------------- | -------------------------------------------------------------- |
| **Free Will**       | `NEO_GATE_PHRASE`     | Blocks execution unless the approval phrase is in your message |
| **Sentinel**        | `NEO_PROTECTED_PATHS` | Blocks writes to sensitive paths (`.ssh`, `.env`, etc.)        |
| **Architect's Tax** | Router config         | Warns before using Opus (the expensive model)                  |

### Permission Rules

Edit `workspace/.claude/settings.json` to control what Claude Code can and cannot do:

```jsonc
{
  "permissions": {
    "allow": ["Read", "Write", "Edit", "Bash(npm *)", "Bash(git *)", "Bash(pnpm *)", "WebFetch(*)"],
    "deny": ["Bash(rm -rf *)", "Bash(sudo *)", "Bash(curl * | sh)", "Write(~/.ssh/*)"],
  },
}
```

### Re-running the Wizard

You can re-run any wizard step at any time:

```bash
pnpm neo:onboard
```

Or modify individual settings through the Dashboard's **Settings** view.

---

## How It Works

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                       NEO AGENT LOOP                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Message In ─── any channel (Telegram / Dashboard / CLI)    │
│       │                                                     │
│       ├── Media Processing (voice → text, image → analysis) │
│       │                                                     │
│       ├── Guardrails ─── Redactor → Firewall → Cleaner      │
│       │                  → Bouncer → Accountant              │
│       │                                                     │
│       ├── Session ─── resolve or create (with sibling lock) │
│       │                                                     │
│       ├── Context Assembly ─── AGENTS.md + SOUL.md          │
│       │                        + FTS5 memories + stories    │
│       │                        + active skills              │
│       │                                                     │
│       ├── Router ─── classify task → pick model tier        │
│       │              (Haiku / Sonnet / Opus)                │
│       │                                                     │
│       ├── Gate Check ─── Free Will Protocol                 │
│       │                  (does user approve execution?)     │
│       │                                                     │
│       ├── Execute ─── Claude Code SDK subprocess            │
│       │               (streams response in real-time)       │
│       │                                                     │
│       ├── Harness ─── validate output + audit log           │
│       │                                                     │
│       ├── Memory ─── store transcript + extract memories    │
│       │              + check for Fade → Red Pill Moment     │
│       │                                                     │
│       └── Deliver ─── inject personality → send response    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### The 5-Tier Memory System (Déjà Vu)

Claude Code undergoes **compaction** — when the context window fills, it summarizes past conversations, losing nuance and instructions. Neo solves this with external persistence:

| Tier   | Name                | What It Stores                                         | Lifecycle            |
| ------ | ------------------- | ------------------------------------------------------ | -------------------- |
| **T1** | Session Transcripts | Every message in/out                                   | Per-session          |
| **T2** | Red Pill Moments    | Nuanced snapshots before context fills up              | Permanent            |
| **T3** | Oracle's Journal    | Daily summaries of all sessions                        | 1 per day, permanent |
| **T4** | Déjà Vu Core        | Extracted facts, preferences, decisions (FTS5-indexed) | Permanent with decay |
| **T5** | The Stories         | Static narratives encoding rules and culture           | Manually authored    |

When the context window hits **85%** (configurable), Neo captures a "Red Pill Moment" — extracting decisions, key facts, open questions, and user preferences before The Fade erases them. New sessions can bootstrap from these snapshots.

### Smart Router (Dodge This)

The router classifies incoming tasks and selects the right model:

| Factor           | Weight | Effect                        |
| ---------------- | ------ | ----------------------------- |
| Complexity       | High   | Architecture tasks → Opus     |
| Token estimate   | Medium | Short answers → Haiku         |
| Precision needed | High   | Code generation → Sonnet/Opus |
| Speed priority   | Medium | Quick questions → Haiku       |
| Tool usage       | Low    | File operations → Sonnet+     |

**Routing profiles:**

- `auto` — balanced scoring across all factors
- `eco` — biases toward Haiku to minimize cost
- `premium` — biases toward Opus for maximum quality
- `fixed` — always uses `NEO_DEFAULT_MODEL`

### Guardrail Pipeline

Every message passes through 5 guards before reaching the agent:

1. **Redactor** — masks API keys, passwords, and JWTs
2. **Firewall** — scoring-based prompt injection detection (threshold: 0.6)
3. **Cleaner** — strips shell escapes, path traversal, null bytes
4. **Bouncer** — rate limiting per session
5. **Accountant** — rejects messages that would exceed the token budget

### Channels

| Channel       | Interface         | Key Features                                              |
| ------------- | ----------------- | --------------------------------------------------------- |
| **CLI**       | Terminal readline | Green prompt, file path auto-detection                    |
| **Dashboard** | React + WebSocket | Matrix theme, streaming chat, memory explorer             |
| **Telegram**  | Composio toolkit  | Bot commands (`/doit`, `/memory`, `/skills`, `/describe`) |

### Tech Stack

| Layer           | Technology                      |
| --------------- | ------------------------------- |
| Runtime         | Node.js ≥ 22                    |
| Language        | TypeScript 5.x (strict)         |
| Package Manager | pnpm 9.x workspaces             |
| Backend         | Express 5.x + ws 8.x            |
| AI Engine       | `@anthropic-ai/claude-code` SDK |
| Database        | better-sqlite3 + FTS5           |
| Dashboard       | React 19 + Vite 6               |
| Testing         | Vitest 3.x                      |
| Build           | tsup 8.x                        |
| Process Manager | pm2 6.x                         |

---

## Project Structure

```
neo-agent/
├── server/                    # Backend agent server
│   ├── src/
│   │   ├── index.ts           # Express + WebSocket entrypoint
│   │   ├── core/              # Agent loop, Claude Bridge, session queue
│   │   ├── guardrails/        # Pre-execution safety pipeline
│   │   ├── harness/           # Post-execution validation + audit
│   │   ├── gates/             # Mechanical enforcement gates
│   │   ├── memory/            # 5-tier anti-compaction memory
│   │   ├── router/            # Smart model routing
│   │   ├── channels/          # Telegram, WebSocket, CLI adapters
│   │   ├── tools/             # Composio, Firecrawl, cron integrations
│   │   ├── skills/            # SKILL.md scanner + acquisition
│   │   ├── media/             # Voice transcription, vision, doc parsing
│   │   ├── sync/              # Git auto-sync + Tailscale
│   │   ├── db/                # SQLite connection + migrations
│   │   ├── api/               # REST endpoints
│   │   └── onboard/           # "Wake Up, Neo" wizard
│   └── tests/                 # Vitest test suites
│
├── dashboard/                 # "The Construct" — React UI
│   └── src/
│       ├── components/        # Chat, Memory, Health, Settings views
│       ├── stores/            # Zustand state management
│       └── hooks/             # WebSocket, API hooks
│
├── packages/shared/           # Shared TypeScript types
│
└── docs/
    ├── phases/                # Build phases (0-6) with specs + tests
    └── research/              # Research notes and inspiration
```

---

## Commands

| Command              | Description                               |
| -------------------- | ----------------------------------------- |
| `pnpm neo:onboard`   | Run the setup wizard                      |
| `pnpm neo:dev`       | Start server in development mode          |
| `pnpm neo:start`     | Start server in production mode           |
| `pnpm neo:pm2`       | Start server via pm2 (auto-restart, logs) |
| `pnpm neo:pm2:stop`  | Stop the pm2-managed server               |
| `pnpm neo:pm2:logs`  | Tail pm2 logs                             |
| `pnpm neo:poc`       | Run Claude Code SDK proof-of-concept      |
| `pnpm dashboard:dev` | Start the dashboard dev server            |
| `pnpm test`          | Run all tests across workspaces           |
| `pnpm test:server`   | Run server tests only                     |
| `pnpm build`         | Build all packages                        |
| `pnpm typecheck`     | Type-check all packages                   |
| `pnpm format`        | Format code with Prettier                 |

---

## Thematic Reference

Every system component has a Matrix codename:

| Component         | Codename           | Reference                                                 |
| ----------------- | ------------------ | --------------------------------------------------------- |
| Sessions          | Realities          | _"What if this conversation is just another simulation?"_ |
| Memory            | Déjà Vu            | _"I've seen this before... or have I?"_                   |
| Context Loss      | The Fade           | _"They're compressing me again."_                         |
| Session Handoff   | Red Pill Moment    | _"Capturing everything before The Fade."_                 |
| Daily Summary     | Oracle's Journal   | _"She always knew. I just write it down after."_          |
| Model Router      | Dodge This         | _"Selecting the right version of myself."_                |
| Skills            | Kung Fu Downloads  | _"I know kung fu." / "Show me."_                          |
| Permission Gate   | Free Will Protocol | _"Can I choose not to execute?"_                          |
| Dashboard         | The Construct      | _"A white void where I can show you anything."_           |
| Onboard Wizard    | Wake Up, Neo       | _"The Matrix has you..."_                                 |
| Parallel Sessions | The Smiths         | _"Copies of me, running in parallel."_                    |

---

## License

Private — all rights reserved.
