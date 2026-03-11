# CLAUDE.md — Project Rules for Neo-Agent

## Architecture Rules

### Cross-Channel Consistency

Telegram MUST always have feature parity with CLI, unless the feature is inherently CLI-specific (e.g., `/clear`, `/exit`, `/onboard`). When implementing or modifying a feature:

1. **Behavioral logic** (memory extraction, session resume, auto-retry, compaction, debug injection, model routing) belongs in the **agent pipeline** (`server/src/core/agent.ts`), NOT in individual channel adapters. This ensures all channels get it automatically.
2. **New slash commands** must be registered for both CLI and Telegram in `channels/command-registry.ts`, unless inappropriate for Telegram.
3. **Before marking a feature complete**, verify: "Does this work for CLI AND Telegram?" If a channel is missing, it's not done.

### Where Shared Logic Lives

- The agent pipeline (`server/src/core/agent.ts`) owns: message recording, memory extraction, session resume, auto-retry on timeout, debug context injection, short-followup model reuse, cost budget warnings, auto-compaction.
- Channel adapters (`channels/telegram.ts`, `cli/chat.ts`) should only handle channel-specific I/O (formatting, transport, input parsing, terminal rendering).
- CLI currently calls `ClaudeBridge` directly (for streaming support) rather than going through `NeoAgent`. This means CLI implements some behavioral features locally. Any new behavioral feature added to CLI **must also** be added to the pipeline.

### CLI-Only Features (appropriate exceptions)

These features are CLI-specific by nature and do NOT need Telegram equivalents:

- `/clear` — clear terminal
- `/exit`, `/quit` — quit process
- `/onboard` — interactive terminal wizard

## Pre-Commit Checklist

- Pre-commit hook runs Prettier + typecheck — fix errors before committing.
- Version auto-bumps on commit via pre-commit hook.
- Update `install.sh` when new dependencies are added.
