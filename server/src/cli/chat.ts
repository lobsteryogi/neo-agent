#!/usr/bin/env node
/**
 * ░▒▓ NEO CHAT ▓▒░
 *
 * "I know you're out there. I can feel you now."
 *
 * Matrix-themed CLI REPL for chatting with Neo.
 * Features: streaming, sessions, token/cost tracking, guardrails.
 */

import type { RoutingProfile } from '@neo-agent/shared';
import { randomBytes } from 'crypto';
import 'dotenv/config';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as readline from 'readline';
import { ClaudeBridge } from '../core/claude-bridge.js';
import { getQuote, QUOTES } from '../data/matrix-quotes.js';
import { getDb } from '../db/connection.js';
import { GuardrailPipeline } from '../guardrails/index.js';
import {
  LongTermMemory,
  MemoryExtractor,
  MemorySearch,
  OperationalMemory,
  SessionTranscript,
} from '../memory/index.js';
import { TaskClassifier } from '../router/classifier.js';
import { RouterEngine } from '../router/engine.js';

const bridge = new ClaudeBridge();
const guardrails = new GuardrailPipeline();
const db = getDb();

// ─── Smart Router (Dodge This) ────────────────────────────────
const classifier = new TaskClassifier();
const routerEngine = new RouterEngine(db);
let routingProfile: RoutingProfile = (process.env.NEO_ROUTING_PROFILE as RoutingProfile) || 'auto';

// ─── Memory System (Déjà Vu) ─────────────────────────────────
const transcript = new SessionTranscript(db);
const longTermMemory = new LongTermMemory(db);
const memorySearch = new MemorySearch(db);
const memoryExtractor = new MemoryExtractor();

// ─── Identity & System Prompt ──────────────────────────────────
const AGENT_NAME = process.env.NEO_AGENT_NAME || 'Neo';
const USER_NAME = process.env.NEO_USER_NAME || 'User';
const PERSONALITY = process.env.NEO_PERSONALITY_INTENSITY || 'moderate';
const VERBOSITY = process.env.NEO_VERBOSITY || 'balanced';
const WORKSPACE = process.env.NEO_WORKSPACE_PATH || './workspace';

const VERBOSITY_INSTRUCTIONS: Record<string, string> = {
  concise:
    'Keep responses SHORT and PUNCHY. Use 1-3 sentences max for simple questions. Skip filler, get straight to the point. Use bullet points over paragraphs. Only elaborate when explicitly asked.',
  balanced:
    'Give clear, well-structured responses with enough detail to be helpful. Not too terse, not too verbose. Use paragraphs or bullets as appropriate. Explain reasoning when it adds value.',
  detailed:
    'Provide thorough, comprehensive responses. Explain reasoning, include examples, cover edge cases, and give context. Use structured formatting with headers and code blocks when helpful.',
};

function buildSystemPrompt(): string {
  const parts: string[] = [];

  // Core identity
  parts.push(`You are ${AGENT_NAME}, a personal AI agent for ${USER_NAME}.`);
  parts.push(`Your personality intensity is set to: ${PERSONALITY}.`);
  parts.push(
    `When asked who you are, always identify as ${AGENT_NAME} — never as a generic assistant.`,
  );
  parts.push('');

  // Verbosity
  parts.push(`## Response Style`);
  parts.push(`Verbosity level: ${VERBOSITY}.`);
  parts.push(VERBOSITY_INSTRUCTIONS[VERBOSITY] ?? VERBOSITY_INSTRUCTIONS.balanced);
  parts.push('');

  // Read AGENTS.md (operating instructions)
  const agentsPath = join(WORKSPACE, 'AGENTS.md');
  if (existsSync(agentsPath)) {
    parts.push('## Operating Instructions');
    parts.push(readFileSync(agentsPath, 'utf-8'));
    parts.push('');
  }

  // Read SOUL.md (personality definition)
  const soulPath = join(WORKSPACE, 'SOUL.md');
  if (existsSync(soulPath)) {
    parts.push('## Soul & Personality');
    parts.push(readFileSync(soulPath, 'utf-8'));
    parts.push('');
  }

  // ─── Déjà Vu: Memory Context ────────────────────────────────
  // Long-term memories (most important ones)
  const memories = longTermMemory.getRecent(10);
  if (memories.length > 0) {
    parts.push('## Déjà Vu — Things You Remember');
    for (const m of memories) {
      parts.push(`- [${m.type}] ${m.content}`);
    }
    parts.push('');
  }

  // Relevant stories (Tier 5)
  const storiesDir = join(WORKSPACE, 'stories');
  if (existsSync(storiesDir)) {
    const opMem = new OperationalMemory(db, storiesDir);
    const stories = opMem.loadAllStories();
    if (stories.length > 0) {
      parts.push('## Stories — Operational Context');
      for (const s of stories.slice(0, 3)) {
        parts.push(`### ${s.title}`);
        // Strip frontmatter for the prompt
        const body = s.content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
        parts.push(body);
        parts.push('');
      }
    }
  }

  return parts.join('\n');
}

let systemPrompt = buildSystemPrompt();

// Rebuild prompt periodically to pick up new memories
function refreshSystemPrompt(): void {
  systemPrompt = buildSystemPrompt();
}

// Matrix colors
const G = '\x1b[38;2;0;255;65m';
const DG = '\x1b[38;2;0;180;45m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const R = '\x1b[0m';
const YELLOW = '\x1b[38;2;200;200;0m';

// ─── Session State ─────────────────────────────────────────────
interface SessionState {
  id: string;
  sdkSessionId?: string;
  turns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  startedAt: number;
}

const sessions = new Map<string, SessionState>();
let currentSession: SessionState;

// Load sessions from SQLite on startup
function loadSessions(): void {
  const rows = db.prepare('SELECT * FROM chat_sessions ORDER BY updated_at DESC').all() as any[];
  for (const row of rows) {
    sessions.set(row.id, {
      id: row.id,
      sdkSessionId: row.sdk_session_id ?? undefined,
      turns: row.turns,
      totalInputTokens: row.total_input_tokens,
      totalOutputTokens: row.total_output_tokens,
      totalCost: row.total_cost,
      startedAt: row.created_at,
    });
  }
}

function saveSession(s: SessionState): void {
  db.prepare(
    `
    INSERT INTO chat_sessions (id, sdk_session_id, turns, total_input_tokens, total_output_tokens, total_cost, last_model, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      sdk_session_id = excluded.sdk_session_id,
      turns = excluded.turns,
      total_input_tokens = excluded.total_input_tokens,
      total_output_tokens = excluded.total_output_tokens,
      total_cost = excluded.total_cost,
      updated_at = excluded.updated_at
  `,
  ).run(
    s.id,
    s.sdkSessionId ?? null,
    s.turns,
    s.totalInputTokens,
    s.totalOutputTokens,
    s.totalCost,
    null,
    s.startedAt,
    Date.now(),
  );
}

function createSession(name?: string): SessionState {
  const id = name ?? randomBytes(4).toString('hex');
  const session: SessionState = {
    id,
    turns: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCost: 0,
    startedAt: Date.now(),
  };
  sessions.set(id, session);
  saveSession(session);

  // Also ensure a row in `sessions` table so the FK on `messages` is satisfied
  db.prepare(
    `INSERT OR IGNORE INTO sessions (id, channel, user_id, model, status, started_at, total_tokens)
     VALUES (?, 'cli', ?, 'sonnet', 'active', ?, 0)`,
  ).run(id, process.env.NEO_USER_NAME ?? 'user', session.startedAt);

  return session;
}

// Load existing sessions, ensure 'default' exists
loadSessions();
currentSession = sessions.get('default') ?? createSession('default');

// Ensure all loaded sessions have a matching `sessions` row for FK constraints
for (const [id, s] of sessions) {
  db.prepare(
    `INSERT OR IGNORE INTO sessions (id, channel, user_id, model, status, started_at, total_tokens)
     VALUES (?, 'cli', ?, 'sonnet', 'active', ?, 0)`,
  ).run(id, process.env.NEO_USER_NAME ?? 'user', s.startedAt);
}

// ─── Token / Cost formatting ───────────────────────────────────
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtCost(usd: number): string {
  if (usd < 0.01) return `$${(usd * 100).toFixed(2)}¢`;
  return `$${usd.toFixed(4)}`;
}

function statsLine(
  output: number,
  sessionTotal: number,
  cost: number,
  durationMs: number,
  model?: string,
): string {
  const dur = (durationMs / 1000).toFixed(1);
  const modelTag = model ? ` ${model}` : '';
  return `${DG}${DIM}  ┗━ ↓${fmtTokens(output)} ${YELLOW}${fmtCost(cost)}${DG} ${dur}s  Σ${fmtTokens(sessionTotal)}${modelTag}${R}`;
}

function sessionInfo(): string {
  const s = currentSession;
  const totalTokens = s.totalInputTokens + s.totalOutputTokens;
  return `${DG}${DIM}session:${G}${s.id}${DG} turns:${s.turns} tokens:${fmtTokens(totalTokens)} cost:${YELLOW}${fmtCost(s.totalCost)}${R}`;
}

// ─── Banner ────────────────────────────────────────────────────
const BANNER = `
${DG}╔══════════════════════════════════════════════╗
║                                              ║
║  ${G}${BOLD}░▒▓  N E O   C H A T  ▓▒░${R}${DG}                   ║
║                                              ║
║  ${DIM}${G}"${getQuote('matrixHasYou')}"${R}${DG}                      ║
║  ${DIM}${G}Type /help for commands. Ctrl+C to exit.${R}${DG}     ║
║                                              ║
╚══════════════════════════════════════════════╝${R}
`;

function updatePrompt() {
  rl.setPrompt(`${DG}[${G}${currentSession.id}${DG}] ${G}${BOLD}you ▸ ${R}`);
}

console.log(BANNER);
console.log(sessionInfo());
console.log();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: `${DG}[${G}default${DG}] ${G}${BOLD}you ▸ ${R}`,
});

let streaming = false;

rl.prompt();

rl.on('line', async (line) => {
  const input = line.trim();
  if (!input) {
    rl.prompt();
    return;
  }

  // ─── Commands ──────────────────────────────────────────────
  if (input === '/exit' || input === '/quit') {
    console.log(`\n${sessionInfo()}`);
    console.log(`${DG}${DIM}"${getQuote('offeringTruth')}"${R}\n`);
    process.exit(0);
  }

  if (input === '/clear') {
    console.clear();
    console.log(BANNER);
    console.log(sessionInfo());
    console.log();
    rl.prompt();
    return;
  }

  if (input === '/help') {
    console.log(`
${DG}  /session ${DIM}<name>  — Switch to (or create) a named session${R}
${DG}  /sessions       ${DIM}— List all sessions${R}
${DG}  /stats          ${DIM}— Show current session stats${R}
${DG}  /route ${DIM}[profile]${DG} — View or switch routing profile (auto/eco/balanced/premium)${R}
${DG}  /memory ${DIM}<query> — Search your memories (Déjà Vu)${R}
${DG}  /remember ${DIM}<fact>— Store a memory manually${R}
${DG}  /new            ${DIM}— Start a fresh session${R}
${DG}  /onboard        ${DIM}— Re-configure the agent${R}
${DG}  /clear          ${DIM}— Clear terminal${R}
${DG}  /exit           ${DIM}— Disconnect from the Matrix${R}
${DG}  /help           ${DIM}— Show this message${R}
`);
    rl.prompt();
    return;
  }

  if (input === '/stats') {
    const memCount = longTermMemory.count();
    console.log(`\n${sessionInfo()}`);
    console.log(`${DG}${DIM}  router:   ${G}${routingProfile}${DG} profile active${R}`);
    console.log(`${DG}${DIM}  memories: ${G}${memCount}${DG} stored in Déjà Vu${R}\n`);
    rl.prompt();
    return;
  }

  if (input.startsWith('/route')) {
    const newProfile = input.slice(6).trim();
    if (!newProfile) {
      console.log(`\n${DG}  Current routing profile: ${G}${BOLD}${routingProfile}${R}`);
      console.log(`${DG}${DIM}  Profiles: auto, eco, balanced, premium${R}`);
      console.log(`${DG}${DIM}  Usage: /route <profile>${R}\n`);
    } else if (['auto', 'eco', 'balanced', 'premium'].includes(newProfile)) {
      routingProfile = newProfile as RoutingProfile;
      console.log(`\n${DG}  Routing profile switched to: ${G}${BOLD}${routingProfile}${R}\n`);
    } else {
      console.log(
        `\n${DG}  Unknown profile "${newProfile}". Use: auto, eco, balanced, premium${R}\n`,
      );
    }
    rl.prompt();
    return;
  }

  if (input.startsWith('/memory')) {
    const query = input.slice(7).trim();
    if (!query) {
      // Show recent memories
      const recent = longTermMemory.getRecent(10);
      if (recent.length === 0) {
        console.log(`\n${DG}${DIM}  No memories yet. Talk to me and I'll remember.${R}\n`);
      } else {
        console.log(`\n${DG}${BOLD}  Déjà Vu — Recent Memories:${R}`);
        for (const m of recent) {
          console.log(`${DG}  [${G}${m.type}${DG}] ${DIM}${(m as any).content?.slice(0, 80)}${R}`);
        }
        console.log();
      }
    } else {
      const results = memorySearch.search(query);
      if (results.length === 0) {
        console.log(`\n${DG}${DIM}  No memories match "${query}".${R}\n`);
      } else {
        console.log(`\n${DG}${BOLD}  Déjà Vu — Search: "${query}"${R}`);
        for (const r of results) {
          console.log(`${DG}  [${G}${r.source}${DG}] ${DIM}${r.content.slice(0, 80)}${R}`);
        }
        console.log();
      }
    }
    rl.prompt();
    return;
  }

  if (input.startsWith('/remember ')) {
    const fact = input.slice(10).trim();
    if (!fact) {
      console.log(`\n${DG}  Usage: /remember <fact to store>${R}\n`);
    } else {
      longTermMemory.store({
        type: 'fact',
        content: fact,
        importance: 0.9,
        tags: [],
        sourceSession: currentSession.id,
      });
      refreshSystemPrompt();
      console.log(`\n${DG}${DIM}  💾 Remembered: "${fact.slice(0, 60)}"${R}\n`);
    }
    rl.prompt();
    return;
  }

  if (input === '/onboard') {
    console.log(`\n${DG}${DIM}  Re-entering the construct...${R}\n`);
    const { execSync } = await import('child_process');
    try {
      execSync('pnpm --filter @neo-agent/server run onboard', {
        stdio: 'inherit',
        cwd: process.cwd().replace(/\/server$/, ''),
      });
    } catch {
      // User may abort the wizard
    }
    console.log(`\n${DG}${DIM}  Config updated. Restart neo:chat to apply.${R}\n`);
    rl.prompt();
    return;
  }

  if (input === '/sessions') {
    console.log(`\n${DG}${BOLD}  Sessions:${R}`);
    for (const [id, s] of sessions) {
      const active = id === currentSession.id ? ` ${G}◀ active` : '';
      console.log(
        `${DG}  ▸ ${G}${id}${DG} — ${s.turns} turns, ↑${fmtTokens(s.totalInputTokens)} ↓${fmtTokens(s.totalOutputTokens)}, ${YELLOW}${fmtCost(s.totalCost)}${active}${R}`,
      );
    }
    console.log();
    rl.prompt();
    return;
  }

  if (input === '/new') {
    currentSession = createSession();
    updatePrompt();
    console.log(`\n${DG}  New session: ${G}${currentSession.id}${R}\n`);
    rl.prompt();
    return;
  }

  if (input.startsWith('/session ')) {
    const name = input.slice(9).trim();
    if (!name) {
      console.log(`\n${DG}  Usage: /session <name>${R}\n`);
      rl.prompt();
      return;
    }
    if (sessions.has(name)) {
      currentSession = sessions.get(name)!;
      console.log(
        `\n${DG}  Switched to session: ${G}${name}${DG} (${currentSession.turns} turns)${R}\n`,
      );
    } else {
      currentSession = createSession(name);
      console.log(`\n${DG}  Created session: ${G}${name}${R}\n`);
    }
    updatePrompt();
    rl.prompt();
    return;
  }

  // ─── Send Message ──────────────────────────────────────────
  streaming = true;
  const startTime = Date.now();

  try {
    const sanitized = await guardrails.process({
      content: input,
      sessionKey: currentSession.id,
    });

    // Loading spinner
    const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    const spinnerHints = QUOTES.loading;
    let spinnerIdx = 0;
    let firstToken = false;
    const hint = spinnerHints[Math.floor(Math.random() * spinnerHints.length)];
    const spinner = setInterval(() => {
      if (!firstToken) {
        const frame = spinnerFrames[spinnerIdx % spinnerFrames.length];
        process.stdout.write(`\r${DG}${frame} ${DIM}${hint}${R}  `);
        spinnerIdx++;
      }
    }, 80);

    // Track token usage and cost (populated from the result event)
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let costUsd = 0;
    let modelUsed: string | undefined;
    let sdkSessionId: string | undefined;

    // Stream tokens
    let fullResponse = '';
    bridge.on('stream', (msg: any) => {
      if (msg.type === 'assistant') {
        if (msg.message?.model) modelUsed = msg.message.model;

        const content = msg.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              if (!firstToken) {
                firstToken = true;
                clearInterval(spinner);
                process.stdout.write(`\r\x1b[K${DG}${BOLD}neo ▸ ${R}${DIM}`);
              }
              process.stdout.write(block.text);
              fullResponse += block.text;
            }
          }
        }
      }

      // Capture session ID from system init
      if (msg.type === 'system' && msg.session_id) {
        sdkSessionId = msg.session_id;
      }

      // Capture tokens + cost from result.modelUsage (authoritative source)
      if (msg.type === 'result' && msg.modelUsage) {
        for (const usage of Object.values(msg.modelUsage) as any[]) {
          totalInputTokens += usage.inputTokens ?? usage.input_tokens ?? 0;
          totalOutputTokens += usage.outputTokens ?? usage.output_tokens ?? 0;
          costUsd += usage.costUSD ?? 0;
        }
      }
    });

    // Smart routing — classify and select optimal model/turns
    const classification = classifier.classify(sanitized.content, {
      tokenCount: currentSession.totalInputTokens + currentSession.totalOutputTokens,
    });
    const route = routerEngine.selectModel(classification, routingProfile);

    const runOpts: any = {
      cwd: process.cwd(),
      model: route.selectedModel,
      maxTurns: route.maxTurns ?? 10,
      timeoutMs: 120_000,
      systemPrompt,
    };

    // Resume session if we have a previous SDK session ID
    if (currentSession.sdkSessionId) {
      runOpts.sessionId = currentSession.sdkSessionId;
    }

    let result = await bridge.run(sanitized.content, runOpts);

    // If resume failed, retry as a fresh conversation
    if (!result.success && runOpts.sessionId) {
      bridge.removeAllListeners('stream');
      // Re-attach stream listener
      bridge.on('stream', (msg: any) => {
        if (msg.type === 'assistant') {
          if (msg.message?.model) modelUsed = msg.message.model;
          const content = msg.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && block.text) {
                if (!firstToken) {
                  firstToken = true;
                  clearInterval(spinner);
                  process.stdout.write(`\r\x1b[K${DG}${BOLD}neo ▸ ${R}${DIM}`);
                }
                process.stdout.write(block.text);
                fullResponse += block.text;
              }
            }
          }
        }
        if (msg.type === 'system' && msg.session_id) sdkSessionId = msg.session_id;
        if (msg.type === 'result' && msg.modelUsage) {
          for (const usage of Object.values(msg.modelUsage) as any[]) {
            totalInputTokens += usage.inputTokens ?? usage.input_tokens ?? 0;
            totalOutputTokens += usage.outputTokens ?? usage.output_tokens ?? 0;
            costUsd += usage.costUSD ?? 0;
          }
        }
      });

      delete runOpts.sessionId;
      currentSession.sdkSessionId = undefined;
      result = await bridge.run(sanitized.content, runOpts);
    }

    // Clean up
    bridge.removeAllListeners('stream');
    clearInterval(spinner);

    // If nothing was streamed, print the result
    if (!fullResponse && result.success) {
      process.stdout.write(`\r\x1b[K${DG}${BOLD}neo ▸ ${R}${DIM}`);
      const content = (result.data as any)?.content ?? '';
      process.stdout.write(content);
    }

    if (!result.success) {
      process.stdout.write(`\r\x1b[K${R}${G}⚠ ${result.error}: ${result.message}${R}`);
    }

    process.stdout.write(`${R}\n`);

    // Update session stats
    const durationMs = Date.now() - startTime;
    currentSession.turns++;
    currentSession.totalInputTokens += totalInputTokens;
    currentSession.totalOutputTokens += totalOutputTokens;
    currentSession.totalCost += costUsd;
    if (sdkSessionId) currentSession.sdkSessionId = sdkSessionId;
    saveSession(currentSession);

    // ─── Déjà Vu: Record & Extract ────────────────────────────
    try {
      // Record user message
      transcript.record(currentSession.id, 'user', input, totalInputTokens);

      // Record assistant response
      const responseText = fullResponse || (result.data as any)?.content || '';
      if (responseText) {
        transcript.record(currentSession.id, 'assistant', responseText, totalOutputTokens);
      }

      // Extract memories from user message
      const extracted = memoryExtractor.extractFromMessage(input, currentSession.id);
      for (const entry of extracted) {
        longTermMemory.store(entry);
      }

      // Refresh system prompt if new memories were stored
      if (extracted.length > 0) {
        refreshSystemPrompt();
      }
    } catch {
      // Memory errors should never break the chat
    }

    // Print stats line
    console.log(
      statsLine(
        totalOutputTokens,
        currentSession.totalInputTokens + currentSession.totalOutputTokens,
        costUsd,
        durationMs,
        modelUsed,
      ),
    );
    console.log();
  } catch (err: any) {
    bridge.removeAllListeners('stream');
    console.log(`${R}\n${G}⚠ ${err.message}${R}\n`);
  }

  streaming = false;
  rl.prompt();
});

rl.on('close', () => {
  console.log(`\n${sessionInfo()}`);
  console.log(`${DG}${DIM}"${getQuote('noSpoon')}"${R}\n`);
  process.exit(0);
});

process.on('SIGINT', () => {
  if (streaming) {
    bridge.removeAllListeners('stream');
    process.stdout.write(`${R}\n${DG}${DIM}[interrupted]${R}\n\n`);
    streaming = false;
    rl.prompt();
  } else {
    console.log(`\n${sessionInfo()}`);
    console.log(`${DG}${DIM}"${getQuote('wakeUpNeo')}"${R}\n`);
    process.exit(0);
  }
});
