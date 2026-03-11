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
import { enableLogRelay, getRecentLogs, logger } from '../utils/logger.js';
import {
  buildTranscriptMarkdown,
  calculateTimeoutMs,
  formatDebugLogs,
  injectCompactedContext,
  injectDebugContext,
  isDebugIntent,
} from '../utils/patterns.js';
import { color, getSpinnerFrame } from '../utils/terminal.js';
import { TaskRepo } from '../db/task-repo.js';
import { handleCommand } from './lib/commands.js';
import {
  buildBanner,
  buildPrompt,
  fmtCost,
  fmtTokens,
  isShortFollowup,
  R,
  sessionInfo,
  statsLine,
} from './lib/format.js';
import { SessionManager } from './lib/sessions.js';
import { CompactionManager } from './lib/compaction.js';
import { attachStreamHandler, createStreamContext } from './lib/stream-handler.js';
import { buildSystemPrompt, type SystemPromptDeps } from './lib/system-prompt.js';

// ─── Core Services ────────────────────────────────────────────

const bridge = new ClaudeBridge();
const guardrails = new GuardrailPipeline();
const db = getDb();

// Relay chat logs to the neo:dev server terminal
enableLogRelay();

const log = logger('chat');

log.debug('Initializing chat', {
  workspace: process.env.NEO_WORKSPACE_PATH || './workspace',
  logLevel: process.env.NEO_LOG_LEVEL || 'info',
  permissionMode: process.env.NEO_PERMISSION_MODE || 'default',
  defaultModel: process.env.NEO_DEFAULT_MODEL || 'sonnet',
  routingProfile: process.env.NEO_ROUTING_PROFILE || 'auto',
  personality: process.env.NEO_PERSONALITY_INTENSITY || 'full-existential-crisis',
});

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

// ─── Browser Availability ─────────────────────────────────────
import { AgentBrowser } from '../browser/index.js';

let browserAvailable = false;
try {
  const browser = new AgentBrowser();
  const health = await browser.healthCheck();
  browserAvailable = health.available;
  if (browserAvailable) {
    log.debug('Browser automation available', { version: health.version });
  }
} catch {
  log.debug('Browser check skipped');
}

const promptDeps: SystemPromptDeps = {
  db,
  longTermMemory,
  agentName: process.env.NEO_AGENT_NAME || 'Neo',
  userName: process.env.NEO_USER_NAME || 'Human',
  personality: process.env.NEO_PERSONALITY_INTENSITY || 'full-existential-crisis',
  verbosity: process.env.NEO_VERBOSITY || 'balanced',
  workspace: WORKSPACE,
  browserAvailable,
};

let systemPrompt = buildSystemPrompt(promptDeps);
function refreshSystemPrompt(): void {
  systemPrompt = buildSystemPrompt(promptDeps);
}

// ─── Sessions ─────────────────────────────────────────────────

const sessionMgr = new SessionManager(db);
log.debug('Session initialized', {
  sessionId: sessionMgr.current.id,
  sdkSessionId: sessionMgr.current.sdkSessionId ?? null,
  turns: sessionMgr.current.turns,
});

// ─── REPL Setup ───────────────────────────────────────────────

console.log(buildBanner());
console.log(`  ${sessionInfo(sessionMgr.current)}`);
console.log();

const USER_NAME = promptDeps.userName;
const AGENT_NAME = promptDeps.agentName;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: buildPrompt('default', USER_NAME),
});

let streaming = false;
rl.prompt();

// ─── Command Deps ─────────────────────────────────────────────

// ─── Context Compaction ──────────────────────────────────────

const compaction = new CompactionManager(
  bridge,
  sessionMgr,
  transcript,
  WORKSPACE,
  refreshSystemPrompt,
  {
    keepRecent: 20,
    autoCompactThreshold: parseInt(process.env.NEO_AUTO_COMPACT_TURNS ?? '15', 10),
  },
);

// ─── One-shot model override (/model command) ────────────────
let modelOverride: import('@neo-agent/shared').ModelTier | null = null;

// ─── Last input for /retry ────────────────────────────────────
let lastInput = '';

// ─── Cost budget ──────────────────────────────────────────────
const COST_BUDGET = parseFloat(process.env.NEO_COST_BUDGET ?? '0');

// ─── Core send function ───────────────────────────────────────

async function processInput(input: string): Promise<void> {
  lastInput = input;
  streaming = true;
  const startTime = Date.now();
  log.debug('Processing input', { length: input.length, sessionId: sessionMgr.current.id });

  try {
    const sanitized = await guardrails.process({
      content: input,
      sessionKey: sessionMgr.current.id,
    });
    log.debug('Guardrails passed', {
      originalLength: input.length,
      sanitizedLength: sanitized.content.length,
      modified: input !== sanitized.content,
    });

    // Smart routing
    const classification = classifier.classify(sanitized.content, {
      tokenCount: sessionMgr.current.totalInputTokens + sessionMgr.current.totalOutputTokens,
    });
    log.debug('Task classified', {
      complexity: classification.complexity,
      tokenEstimate: classification.tokenEstimate,
      contextNeeds: classification.contextNeeds,
      precisionRequired: classification.precisionRequired,
    });

    const route = routerEngine.selectModel(classification, routingProfile);
    log.debug('Route selected', {
      model: route.selectedModel,
      score: route.score,
      maxTurns: route.maxTurns,
      profile: routingProfile,
    });

    // Apply one-shot model override (/model <tier>)
    if (modelOverride) {
      log.debug('Model override applied', { from: route.selectedModel, to: modelOverride });
      route.selectedModel = modelOverride;
      modelOverride = null;
    } else if (isShortFollowup(sanitized.content) && sessionMgr.current.lastModelTier) {
      log.debug('Short followup detected, reusing model', {
        model: sessionMgr.current.lastModelTier,
      });
      route.selectedModel = sessionMgr.current.lastModelTier;
    }

    // Loading spinner — shows the selected model tier
    const spinnerHints = QUOTES.loading;
    let spinnerIdx = 0;
    const hint = spinnerHints[Math.floor(Math.random() * spinnerHints.length)];
    const hintColors = [color.dim, color.dimCyan, color.darkGreen];
    const hintColor = hintColors[Math.floor(Math.random() * hintColors.length)];
    const modelLabel = color.dim(`[${route.selectedModel}]`);
    const ctx = createStreamContext();
    const spinner = setInterval(() => {
      if (!ctx.firstToken) {
        const frame = getSpinnerFrame(spinnerIdx);
        process.stdout.write(`\r${frame} ${modelLabel} ${hintColor(hint)}  `);
        spinnerIdx++;
      }
    }, 80);

    attachStreamHandler(bridge, ctx, spinner, AGENT_NAME);

    // Dynamic timeout
    const timeoutMs = calculateTimeoutMs(classification.complexity);

    const permMode = process.env.NEO_PERMISSION_MODE || 'default';

    // Inject compacted context from /compact into system prompt
    let effectiveSystemPrompt = systemPrompt;
    if (compaction.compactedContext) {
      effectiveSystemPrompt = injectCompactedContext(
        effectiveSystemPrompt,
        compaction.compactedContext,
      );
      log.debug('Compacted context injected', {
        summaryLength: compaction.compactedContext.length,
      });
    }

    const runOpts: any = {
      cwd: WORKSPACE,
      model: route.selectedModel,
      maxTurns: route.maxTurns ?? 10,
      timeoutMs,
      systemPrompt: effectiveSystemPrompt,
      permissionMode: permMode,
      allowDangerouslySkipPermissions: permMode === 'bypassPermissions',
      allowedTools: [
        'Read',
        'Write',
        'Edit',
        'Bash',
        'Glob',
        'Grep',
        'WebSearch',
        'WebFetch',
        'Agent',
      ],
    };

    // Self-debug intent detection
    if (isDebugIntent(sanitized.content)) {
      const recentLogs = getRecentLogs(100);
      if (recentLogs.length > 0) {
        runOpts.systemPrompt = injectDebugContext(
          runOpts.systemPrompt,
          formatDebugLogs(recentLogs),
        );
        log.debug('Debug context injected', { logCount: recentLogs.length });
      }
    } else {
      const lastFew = getRecentLogs(10);
      if (lastFew.length > 0) {
        const summary = lastFew
          .filter((e) => e.level !== 'debug')
          .map((e) => `[${e.level.toUpperCase()}] [${e.namespace}] ${e.message}`)
          .join('\n');
        if (summary) {
          runOpts.systemPrompt += `\n\n## Recent Internal State\n\n<agent_state>\n${summary}\n</agent_state>`;
        }
      }
    }

    // Resume session if we have a previous SDK session ID
    if (sessionMgr.current.sdkSessionId) {
      runOpts.resumeSessionId = sessionMgr.current.sdkSessionId;
      log.debug('Resuming SDK session', { sdkSessionId: sessionMgr.current.sdkSessionId });
    }

    log.debug('Executing bridge.run', {
      model: runOpts.model,
      maxTurns: runOpts.maxTurns,
      timeoutMs: runOpts.timeoutMs,
      permissionMode: runOpts.permissionMode,
      resuming: !!runOpts.resumeSessionId,
    });

    let result = await bridge.run(sanitized.content, runOpts);
    log.debug('Bridge result', { success: result.success, error: result.error ?? null });

    // If resume failed, retry as a fresh conversation
    if (!result.success && runOpts.resumeSessionId) {
      log.debug('Resume failed, retrying as fresh conversation');
      bridge.removeAllListeners('stream');
      attachStreamHandler(bridge, ctx, spinner, AGENT_NAME);
      delete runOpts.resumeSessionId;
      sessionMgr.current.sdkSessionId = undefined;
      result = await bridge.run(sanitized.content, runOpts);
      log.debug('Fresh retry result', { success: result.success });
    }

    // Auto-retry on timeout — once, with halved maxTurns
    const isTimeout =
      !result.success &&
      ((result.error ?? '').toLowerCase().includes('timeout') ||
        (result.message ?? '').toLowerCase().includes('timeout') ||
        (result.error ?? '').includes('ABORT_SIGNAL'));
    if (isTimeout) {
      process.stdout.write(
        `\r\x1b[K  ${color.amber('⏱')} ${color.dim('Timed out — retrying with shorter budget...')}\n`,
      );
      log.debug('Timeout detected, auto-retrying', { originalMaxTurns: runOpts.maxTurns });
      bridge.removeAllListeners('stream');
      attachStreamHandler(bridge, ctx, spinner, AGENT_NAME);
      const retryOpts = {
        ...runOpts,
        maxTurns: Math.max(1, Math.ceil((runOpts.maxTurns ?? 10) / 2)),
        resumeSessionId: undefined,
      };
      delete retryOpts.resumeSessionId;
      result = await bridge.run(sanitized.content, retryOpts);
      log.debug('Auto-retry result', { success: result.success });
    }

    // Clean up
    bridge.removeAllListeners('stream');
    clearInterval(spinner);

    // If nothing was streamed, print the result
    if (!ctx.fullResponse && result.success) {
      process.stdout.write(
        `\r\x1b[K${color.neonCyan(color.bold(AGENT_NAME))} ${color.electricBlue('▸')} ${R}`,
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
    if (ctx.sdkSessionId) {
      s.sdkSessionId = ctx.sdkSessionId;
      if (compaction.compactedContext) {
        log.debug('Compacted context absorbed into SDK session');
        compaction.compactedContext = null;
      }
    }
    s.lastModelTier = route.selectedModel;
    sessionMgr.save(s);
    log.debug('Session updated', {
      sessionId: s.id,
      turn: s.turns,
      inputTokens: ctx.totalInputTokens,
      outputTokens: ctx.totalOutputTokens,
      costUsd: ctx.costUsd,
      durationMs,
      modelUsed: ctx.modelUsed,
      sdkSessionId: ctx.sdkSessionId ?? null,
    });

    // ─── Déjà Vu: Record & Extract ────────────────────────────
    try {
      transcript.record(s.id, 'user', input, ctx.totalInputTokens);
      const responseText = ctx.fullResponse || (result.data as any)?.content || '';
      if (responseText) {
        transcript.record(s.id, 'assistant', responseText, ctx.totalOutputTokens);
      }
      log.debug('Transcript recorded', { sessionId: s.id, responseLength: responseText.length });

      const extracted = memoryExtractor.extractFromMessage(input, s.id);
      for (const entry of extracted) {
        longTermMemory.store(entry);
      }
      if (extracted.length > 0) {
        log.debug('Memories extracted', { count: extracted.length });
        refreshSystemPrompt();
      }
    } catch (err) {
      log.debug('Memory extraction failed', { error: String(err) });
    }

    // Auto-compact if we've hit the turn threshold (fire-and-forget to not block REPL)
    compaction.autoCompactIfNeeded().catch((err) => log.error('Auto-compact failed', err));

    // Cost budget warning
    if (COST_BUDGET > 0 && s.totalCost > COST_BUDGET) {
      console.log(
        `  ${color.amber('⚠')} ${color.yellow(`Session cost ${fmtCost(s.totalCost)} has exceeded budget ${fmtCost(COST_BUDGET)}`)}`,
      );
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
        compaction.lastCompactionInfo,
        s.turns,
        compaction.autoCompactTurnThreshold,
        s.id,
      ),
    );
    console.log();
  } catch (err: any) {
    bridge.removeAllListeners('stream');
    log.error('Chat error', err);
    console.log(`${R}\n${color.amber('⚠')} ${color.yellow(err.message)}${R}\n`);
  }

  streaming = false;
  rl.prompt();
}

// ─── Export transcript to markdown ───────────────────────────

async function exportTranscript(): Promise<void> {
  const s = sessionMgr.current;
  const history = transcript.getHistory(s.id, 1000);
  if (history.length === 0) {
    console.log();
    console.log(`  ${color.dim('No transcript to export.')}`);
    console.log();
    return;
  }
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${process.env.HOME ?? '.'}/neo-export-${s.id}-${date}.md`;
  const markdown = buildTranscriptMarkdown(s, history as any[], fmtTokens, fmtCost);
  const { writeFileSync } = await import('fs');
  writeFileSync(filename, markdown);
  console.log();
  console.log(`  ${color.green('▓')} Exported → ${color.neonCyan(filename)}`);
  console.log();
}

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
  compact: () => compaction.runCompact(),
  retry: async () => {
    if (!lastInput) {
      console.log();
      console.log(`  ${color.dim('Nothing to retry yet.')}`);
      console.log();
      rl.prompt();
      return;
    }
    console.log();
    console.log(`  ${color.dimCyan('↺')} ${color.dim(`Retrying: "${lastInput.slice(0, 60)}"`)}`);
    console.log();
    await processInput(lastInput);
  },
  setModelOverride: (m: import('@neo-agent/shared').ModelTier | null) => {
    modelOverride = m;
  },
  exportTranscript,
  transcript,
  taskRepo: new TaskRepo(db),
};

// ─── Main Loop ────────────────────────────────────────────────

// Multiline input state
let pendingLines: string[] = [];
let inMultilineBlock = false;

rl.on('line', async (line) => {
  // ── Multiline block mode: """ toggles on/off ───────────────
  if (line.trim() === '"""') {
    if (!inMultilineBlock) {
      inMultilineBlock = true;
      rl.setPrompt(color.dim('... '));
      rl.prompt();
    } else {
      inMultilineBlock = false;
      const input = pendingLines.join('\n').trim();
      pendingLines = [];
      rl.setPrompt(buildPrompt(sessionMgr.current.id, USER_NAME));
      if (!input) {
        rl.prompt();
        return;
      }
      const cmdResult = handleCommand(input, commandDeps);
      const handled = cmdResult instanceof Promise ? await cmdResult : cmdResult;
      if (!handled) await processInput(input);
    }
    return;
  }

  if (inMultilineBlock) {
    pendingLines.push(line);
    rl.prompt();
    return;
  }

  // ── Backslash continuation: line ending in \ ───────────────
  if (line.endsWith('\\')) {
    pendingLines.push(line.slice(0, -1));
    rl.setPrompt(color.dim('... '));
    rl.prompt();
    return;
  }

  if (pendingLines.length > 0) {
    pendingLines.push(line);
    const input = pendingLines.join('\n').trim();
    pendingLines = [];
    rl.setPrompt(buildPrompt(sessionMgr.current.id, USER_NAME));
    if (!input) {
      rl.prompt();
      return;
    }
    const cmdResult = handleCommand(input, commandDeps);
    const handled = cmdResult instanceof Promise ? await cmdResult : cmdResult;
    if (!handled) await processInput(input);
    return;
  }

  // ── Normal single-line input ───────────────────────────────
  const input = line.trim();
  if (!input) {
    rl.prompt();
    return;
  }

  const cmdResult = handleCommand(input, commandDeps);
  const handled = cmdResult instanceof Promise ? await cmdResult : cmdResult;
  if (handled) return;

  await processInput(input);
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
