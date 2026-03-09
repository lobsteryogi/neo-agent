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
import 'dotenv/config';
import * as readline from 'readline';
import { ClaudeBridge } from '../core/claude-bridge.js';
import { getQuote, QUOTES } from '../data/matrix-quotes.js';
import { getDb } from '../db/connection.js';
import { GuardrailPipeline } from '../guardrails/index.js';
import {
  LongTermMemory,
  MemoryExtractor,
  MemorySearch,
  SessionTranscript,
} from '../memory/index.js';
import { TaskClassifier } from '../router/classifier.js';
import { RouterEngine } from '../router/engine.js';
import { logger } from '../utils/logger.js';
import { color, getSpinnerFrame } from '../utils/terminal.js';
import { handleCommand } from './lib/commands.js';
import {
  buildBanner,
  buildPrompt,
  isShortFollowup,
  R,
  sessionInfo,
  statsLine,
} from './lib/format.js';
import { SessionManager } from './lib/sessions.js';
import { attachStreamHandler, createStreamContext } from './lib/stream-handler.js';
import { buildSystemPrompt, type SystemPromptDeps } from './lib/system-prompt.js';

// ─── Core Services ────────────────────────────────────────────

const bridge = new ClaudeBridge();
const guardrails = new GuardrailPipeline();
const db = getDb();
const log = logger('chat');

// ─── Smart Router ─────────────────────────────────────────────

const classifier = new TaskClassifier();
const routerEngine = new RouterEngine(db);
let routingProfile: RoutingProfile = (process.env.NEO_ROUTING_PROFILE as RoutingProfile) || 'auto';

// ─── Memory System ────────────────────────────────────────────

const transcript = new SessionTranscript(db);
const longTermMemory = new LongTermMemory(db);
const memorySearch = new MemorySearch(db);
const memoryExtractor = new MemoryExtractor();

// ─── Identity & Config ───────────────────────────────────────

const WORKSPACE = process.env.NEO_WORKSPACE_PATH || './workspace';

const promptDeps: SystemPromptDeps = {
  db,
  longTermMemory,
  agentName: process.env.NEO_AGENT_NAME || 'Neo',
  userName: process.env.NEO_USER_NAME || 'User',
  personality: process.env.NEO_PERSONALITY_INTENSITY || 'moderate',
  verbosity: process.env.NEO_VERBOSITY || 'balanced',
  workspace: WORKSPACE,
};

let systemPrompt = buildSystemPrompt(promptDeps);
function refreshSystemPrompt(): void {
  systemPrompt = buildSystemPrompt(promptDeps);
}

// ─── Sessions ─────────────────────────────────────────────────

const sessionMgr = new SessionManager(db);

// ─── REPL Setup ───────────────────────────────────────────────

console.log(buildBanner());
console.log(`  ${sessionInfo(sessionMgr.current)}`);
console.log();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: buildPrompt('default'),
});

let streaming = false;
rl.prompt();

// ─── Command Deps ─────────────────────────────────────────────

const commandDeps = {
  sessionMgr,
  longTermMemory,
  memorySearch,
  get routingProfile() {
    return routingProfile;
  },
  setRoutingProfile: (p: RoutingProfile) => {
    routingProfile = p;
  },
  refreshSystemPrompt,
  rl,
};

// ─── Main Loop ────────────────────────────────────────────────

rl.on('line', async (line) => {
  const input = line.trim();
  if (!input) {
    rl.prompt();
    return;
  }

  // Handle slash commands
  const cmdResult = handleCommand(input, commandDeps);
  const handled = cmdResult instanceof Promise ? await cmdResult : cmdResult;
  if (handled) return;

  // ─── Send Message ──────────────────────────────────────────
  streaming = true;
  const startTime = Date.now();

  try {
    const sanitized = await guardrails.process({
      content: input,
      sessionKey: sessionMgr.current.id,
    });

    // Loading spinner
    const spinnerHints = QUOTES.loading;
    let spinnerIdx = 0;
    const hint = spinnerHints[Math.floor(Math.random() * spinnerHints.length)];
    const hintColors = [color.dim, color.dimCyan, color.darkGreen];
    const hintColor = hintColors[Math.floor(Math.random() * hintColors.length)];
    const spinner = setInterval(() => {
      if (!ctx.firstToken) {
        const frame = getSpinnerFrame(spinnerIdx);
        process.stdout.write(`\r${frame} ${hintColor(hint)}  `);
        spinnerIdx++;
      }
    }, 80);

    const ctx = createStreamContext();
    attachStreamHandler(bridge, ctx, spinner);

    // Smart routing
    const classification = classifier.classify(sanitized.content, {
      tokenCount: sessionMgr.current.totalInputTokens + sessionMgr.current.totalOutputTokens,
    });
    const route = routerEngine.selectModel(classification, routingProfile);

    if (isShortFollowup(sanitized.content) && sessionMgr.current.lastModelTier) {
      route.selectedModel = sessionMgr.current.lastModelTier;
    }

    // Dynamic timeout
    const timeoutMs =
      classification.complexity >= 0.7
        ? 600_000
        : classification.complexity >= 0.4
          ? 300_000
          : 120_000;

    const permMode = process.env.NEO_PERMISSION_MODE || 'default';
    const runOpts: any = {
      cwd: WORKSPACE,
      model: route.selectedModel,
      maxTurns: route.maxTurns ?? 10,
      timeoutMs,
      systemPrompt,
      permissionMode: permMode,
      allowDangerouslySkipPermissions: permMode === 'bypassPermissions',
    };

    // Resume session if we have a previous SDK session ID
    if (sessionMgr.current.sdkSessionId) {
      runOpts.resumeSessionId = sessionMgr.current.sdkSessionId;
    }

    let result = await bridge.run(sanitized.content, runOpts);

    // If resume failed, retry as a fresh conversation
    if (!result.success && runOpts.resumeSessionId) {
      bridge.removeAllListeners('stream');
      attachStreamHandler(bridge, ctx, spinner);

      delete runOpts.resumeSessionId;
      sessionMgr.current.sdkSessionId = undefined;
      result = await bridge.run(sanitized.content, runOpts);
    }

    // Clean up
    bridge.removeAllListeners('stream');
    clearInterval(spinner);

    // If nothing was streamed, print the result
    if (!ctx.fullResponse && result.success) {
      process.stdout.write(
        `\r\x1b[K${color.neonCyan(color.bold('neo'))} ${color.electricBlue('▸')} ${R}`,
      );
      const content = (result.data as any)?.content ?? '';
      process.stdout.write(content);
    }

    if (!result.success) {
      process.stdout.write(
        `\r\x1b[K${color.amber('⚠')} ${color.yellow(`${result.error}:`)} ${color.dim(String(result.message))}${R}`,
      );
    }

    process.stdout.write(`${R}\n`);

    // Update session stats
    const durationMs = Date.now() - startTime;
    const s = sessionMgr.current;
    s.turns++;
    s.totalInputTokens += ctx.totalInputTokens;
    s.totalOutputTokens += ctx.totalOutputTokens;
    s.totalCost += ctx.costUsd;
    if (ctx.sdkSessionId) s.sdkSessionId = ctx.sdkSessionId;
    s.lastModelTier = route.selectedModel;
    sessionMgr.save(s);

    // ─── Déjà Vu: Record & Extract ────────────────────────────
    try {
      transcript.record(s.id, 'user', input, ctx.totalInputTokens);

      const responseText = ctx.fullResponse || (result.data as any)?.content || '';
      if (responseText) {
        transcript.record(s.id, 'assistant', responseText, ctx.totalOutputTokens);
      }

      const extracted = memoryExtractor.extractFromMessage(input, s.id);
      for (const entry of extracted) {
        longTermMemory.store(entry);
      }
      if (extracted.length > 0) {
        refreshSystemPrompt();
      }
    } catch (err) {
      log.debug('Memory extraction failed', { error: String(err) });
    }

    // Print stats line
    console.log(
      statsLine(
        ctx.totalOutputTokens,
        s.totalInputTokens + s.totalOutputTokens,
        ctx.costUsd,
        durationMs,
        ctx.modelUsed,
        route.score,
      ),
    );
    console.log();
  } catch (err: any) {
    bridge.removeAllListeners('stream');
    console.log(`${R}\n${color.amber('⚠')} ${color.yellow(err.message)}${R}\n`);
  }

  streaming = false;
  rl.prompt();
});

// ─── Shutdown Handlers ────────────────────────────────────────

rl.on('close', () => {
  console.log();
  console.log(`  ${sessionInfo(sessionMgr.current)}`);
  console.log(`  ${color.dim(color.italic(`"${getQuote('noSpoon')}"`))}`);
  console.log();
  process.exit(0);
});

process.on('SIGINT', () => {
  if (streaming) {
    bridge.removeAllListeners('stream');
    process.stdout.write(`${R}\n${color.amber('[interrupted]')}${R}\n\n`);
    streaming = false;
    rl.prompt();
  } else {
    console.log();
    console.log(`  ${sessionInfo(sessionMgr.current)}`);
    console.log(`  ${color.dim(color.italic(`"${getQuote('wakeUpNeo')}"`))}`);
    console.log();
    process.exit(0);
  }
});
