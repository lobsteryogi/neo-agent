# Neo-Agent — Build Order

> _"I'm going to show them a world without rules and controls. A world where anything is possible."_

## Phase Overview

| Phase | Codename                                                | Description                                                            | Est. Hours | Tests               |
| ----- | ------------------------------------------------------- | ---------------------------------------------------------------------- | ---------- | ------------------- |
| **0** | [Wake Up, Neo](./PHASE-0-WAKE-UP-NEO.md)                | Monorepo scaffold, SDK POC, onboard wizard, DB init                    | 4-6h       | 4 files / 25 tests  |
| **1** | [Core Engine](./PHASE-1-CORE-ENGINE.md)                 | Agent loop, Claude Bridge, gates, guardrails, harness, error recovery  | 8-12h      | 7 files / ~50 tests |
| **2** | [Déjà Vu](./PHASE-2-DEJA-VU.md)                         | 5-tier memory system, FTS5 search, Fade detection, SQLite backup       | 6-8h       | 5 files / ~25 tests |
| **3** | [Router + Sync + Tools](./PHASE-3-ROUTER-SYNC-TOOLS.md) | Smart router, Composio/Firecrawl/Cron, sibling awareness, Git sync     | 6-8h       | 4 files / ~25 tests |
| **4** | [The Construct](./PHASE-4-THE-CONSTRUCT.md)             | React dashboard, Matrix theme, streaming chat, 9 views                 | 10-14h     | 3 files / ~20 tests |
| **5** | [Phone Lines](./PHASE-5-PHONE-LINES.md)                 | Channel architecture, Telegram bot, WS auth, CLI                       | 4-6h       | 1 file / ~15 tests  |
| **6** | [Kung Fu](./PHASE-6-KUNG-FU.md)                         | Skill system, SKILL.md parser, proactive Firecrawl acquisition         | 4-6h       | 3 files / ~20 tests |
| **7** | [The Ones](./PHASE-7-THE-ONES.md)                       | Sub-agent orchestration, agent teams, workspace isolation, message bus | 8-12h      | 5 files / ~25 tests |

**Total estimate: 50-72 hours**

## Dependency Graph

```
Phase 0 (scaffold)
  └── Phase 1 (core engine) ─────────── Phase 5 (channels)
        └── Phase 2 (memory)
              └── Phase 3 (router + tools + sync)
                    ├── Phase 4 (dashboard)
                    ├── Phase 6 (skills)
                    └── Phase 7 (sub-agents)
```

## CTO Audit Fix Distribution

All 13 audit findings are addressed across the phases:

| Fix                             | Phase   | Status                        |
| ------------------------------- | ------- | ----------------------------- |
| 🔴 C1: SDK Reality Check        | Phase 0 | POC script validates SDK      |
| 🔴 C2: Gate scope redefined     | Phase 1 | Pre-execution only            |
| 🔴 C3: Error recovery module    | Phase 1 | `error-recovery.ts`           |
| 🟡 S1: Scoring-based Firewall   | Phase 1 | Weighted patterns + threshold |
| 🟡 S2: Router outcome tracking  | Phase 3 | Audit log for calibration     |
| 🟡 S3: Tool health checks       | Phase 3 | `ToolIntegration` interface   |
| 🟡 S4: Embedding search roadmap | Phase 2 | Noted as Phase 3+ enhancement |
| 🟡 S5: Blue Pill is 3 steps     | Phase 0 | Simplified wizard path        |
| 🟡 S6: Health endpoint          | Phase 1 | `/api/health` + Vital Signs   |
| 🟢 M1: Shared types package     | Phase 0 | `packages/shared/`            |
| 🟢 M2: Versioned DB migrations  | Phase 0 | `_migrations` table           |
| 🟢 M3: API rate limiting        | Phase 1 | `express-rate-limit`          |
| 🟢 M4: WebSocket auth           | Phase 1 | Token-based handshake         |
| 🟢 M5: Cron package clarified   | Phase 0 | `node-cron` (not Go lib)      |
| 🟢 M6: SQLite backup            | Phase 2 | Scheduled `.backup()`         |
| 🟢 M7: Dashboard state mgmt     | Phase 4 | Zustand                       |

## Build Strategy

1. **Start with Phase 0** — validate that the Claude Code SDK works as expected before building the entire architecture on assumptions
2. **Phase 1 is the critical path** — everything depends on the agent loop
3. **Phases 4-7 can be parallelized** once Phase 3 is complete
4. **Ship iteratively** — each phase has acceptance criteria; don't move on until all pass
