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
import { color, getSpinnerFrame } from '../utils/terminal.js';
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
  personality: process.env.NEO_PERSONALITY_INTENSITY || 'moderate',
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
  userName: process.env.NEO_USER_NAME || 'User',
  personality: process.env.NEO_PERSONALITY_INTENSITY || 'moderate',
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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: buildPrompt('default'),
});

let streaming = false;
rl.prompt();

// ─── Command Deps ─────────────────────────────────────────────

// ─── Context Compaction ──────────────────────────────────────
// Compaction summarizes older messages while keeping recent ones verbatim.
// Result is injected into system prompt until absorbed by the SDK session.

let compactedContext: string | null = null;
let lastCompactionInfo: { summarized: number; kept: number } | null = null;

const AUTO_COMPACT_TURN_THRESHOLD = parseInt(process.env.NEO_AUTO_COMPACT_TURNS ?? '15', 10);
const COMPACT_KEEP_RECENT = 20; // keep last N messages verbatim

/**
 * Generate a compacted summary from conversation history.
 * @param messagesToCompact - older messages to summarize
 * @param silent - if true, suppress console output (for auto-compact)
 */
async function generateCompactSummary(
  messagesToCompact: { role: string; content: string }[],
  silent = false,
): Promise<string | null> {
  // Build conversation text — give the summarizer enough to work with
  const conversationText = messagesToCompact
    .map((m) => `[${m.role}]: ${m.content.slice(0, 10000)}`)
    .join('\n\n');

  const compactPrompt = `You are compacting a conversation to reduce context size while preserving all important information.

Produce a structured summary with these sections (skip empty sections):

## Conversation Summary
A 2-3 sentence overview of what was discussed.

## Key Decisions & Outcomes
- Bullet each decision, outcome, or conclusion reached

## Technical Context
- Current project/codebase details established
- File paths, configurations, or architecture discussed
- Code changes made or planned

## User Preferences & Style
- Communication preferences, tool preferences, workflow patterns

## Active Tasks & Open Items
- What was being worked on
- Unresolved questions or next steps

## Important Facts
- Any facts, credentials, names, or specifics that would be needed to continue

Be thorough — aim for ~60% of the original length. Preserve ALL specific details: names, URLs, paths, values, error messages, topics discussed, tools mentioned. Do NOT generalize or drop anything that was explicitly stated.

<conversation>
${conversationText}
</conversation>`;

  try {
    const result = await bridge.run(compactPrompt, {
      cwd: WORKSPACE,
      model: 'sonnet',
      maxTurns: 1,
      timeoutMs: 60_000,
      systemPrompt:
        'You are a context compaction assistant. Produce structured, detailed summaries that preserve all actionable information. Never omit specific values, paths, or technical details. Output only the summary.',
    });

    if (!result.success || !result.data) {
      if (!silent) log.warn('Compaction failed', { error: result.error });
      return null;
    }

    const summary =
      typeof result.data === 'string' ? result.data : ((result.data as any).content ?? '');
    return summary || null;
  } catch (err) {
    log.error('Compaction error', { error: String(err) });
    return null;
  }
}

/**
 * Manual /compact command — compacts the full conversation.
 */
async function runCompact(): Promise<void> {
  const s = sessionMgr.current;
  const beforeTokens = s.totalInputTokens + s.totalOutputTokens;

  if (beforeTokens === 0) {
    console.log();
    console.log(`  ${color.dim('Nothing to compact — no conversation yet.')}`);
    console.log();
    return;
  }

  const history = transcript.getHistory(s.id, 200);
  if (history.length === 0) {
    console.log();
    console.log(`  ${color.dim('No transcript found to compact.')}`);
    console.log();
    return;
  }

  console.log();
  process.stdout.write(`  ${color.darkGreen('⚙')} ${color.dim('Compacting context...')}`);
  log.debug('Manual compact start', {
    turns: s.turns,
    tokens: beforeTokens,
    messageCount: history.length,
  });

  // Split: summarize older messages, keep recent ones verbatim
  const keepCount = Math.min(COMPACT_KEEP_RECENT, history.length);
  const olderMessages = history.slice(0, -keepCount);
  const recentMessages = history.slice(-keepCount);

  let summary: string | null = null;

  if (olderMessages.length > 0) {
    // Summarize older portion
    summary = await generateCompactSummary(olderMessages);
  }

  // Build the compacted context: summary + recent verbatim
  const parts: string[] = [];

  if (summary) {
    parts.push(summary);
  }

  if (recentMessages.length > 0) {
    parts.push('\n## Recent Messages (verbatim)\n');
    for (const m of recentMessages) {
      const truncated = m.content.length > 3000 ? m.content.slice(0, 3000) + '...' : m.content;
      parts.push(`**${m.role}**: ${truncated}\n`);
    }
  }

  compactedContext = parts.join('\n');
  lastCompactionInfo = { summarized: olderMessages.length, kept: recentMessages.length };

  // Break SDK session — next turn starts fresh with compacted context
  s.sdkSessionId = undefined;
  sessionMgr.save(s);
  refreshSystemPrompt();

  const afterEstimate = Math.ceil(compactedContext.length / 4);
  process.stdout.write(
    `\r\x1b[K  ${color.green('▓')} Context compacted  ${color.darkGreen('⚡')}  ${color.dim(`${beforeTokens.toLocaleString()} tokens → ~${afterEstimate.toLocaleString()} token summary`)}\n`,
  );
  if (olderMessages.length > 0) {
    console.log(
      color.dim(
        `    ${olderMessages.length} older messages summarized, ${recentMessages.length} recent kept verbatim.`,
      ),
    );
  } else {
    console.log(
      color.dim(`    ${recentMessages.length} messages kept verbatim (too few to summarize).`),
    );
  }
  console.log(color.dim('    Next message continues with compacted context.'));
  console.log();

  log.debug('Manual compact done', {
    olderSummarized: olderMessages.length,
    recentKept: recentMessages.length,
    summaryTokens: afterEstimate,
    originalTokens: beforeTokens,
    ratio: ((afterEstimate / beforeTokens) * 100).toFixed(1) + '%',
  });
}

/**
 * Auto-compact: triggered after N turns. Summarizes messages older than
 * the last COMPACT_KEEP_RECENT, injects summary into context, and breaks
 * the SDK session to start fresh with reduced tokens.
 */
async function autoCompactIfNeeded(): Promise<void> {
  const s = sessionMgr.current;
  if (s.turns < AUTO_COMPACT_TURN_THRESHOLD) return;
  // Only auto-compact on exact threshold hits (every N turns after first trigger)
  if (s.turns % AUTO_COMPACT_TURN_THRESHOLD !== 0) return;

  const history = transcript.getHistory(s.id, 200);
  if (history.length <= COMPACT_KEEP_RECENT) return;

  log.debug('Auto-compact triggered', { turns: s.turns, messageCount: history.length });
  process.stdout.write(`\n  ${color.darkGreen('⚙')} ${color.dim('Auto-compacting context...')}`);

  const olderMessages = history.slice(0, -COMPACT_KEEP_RECENT);

  // If we already have a compacted context, include it as prior context for the summarizer
  const messagesToSummarize = compactedContext
    ? [
        { role: 'system' as string, content: `[Previous summary]:\n${compactedContext}` },
        ...olderMessages,
      ]
    : olderMessages;

  const summary = await generateCompactSummary(messagesToSummarize, true);

  if (!summary) {
    process.stdout.write(`\r\x1b[K`);
    log.warn('Auto-compact failed — continuing without compaction');
    return;
  }

  const recentMessages = history.slice(-COMPACT_KEEP_RECENT);
  const parts: string[] = [summary, '\n## Recent Messages (verbatim)\n'];
  for (const m of recentMessages) {
    const truncated = m.content.length > 3000 ? m.content.slice(0, 3000) + '...' : m.content;
    parts.push(`**${m.role}**: ${truncated}\n`);
  }

  const beforeTokens = s.totalInputTokens + s.totalOutputTokens;
  compactedContext = parts.join('\n');
  const afterEstimate = Math.ceil(compactedContext.length / 4);
  lastCompactionInfo = { summarized: olderMessages.length, kept: COMPACT_KEEP_RECENT };

  // Break SDK session
  s.sdkSessionId = undefined;
  sessionMgr.save(s);

  process.stdout.write(
    `\r\x1b[K  ${color.green('▓')} Auto-compacted  ${color.darkGreen('⚡')}  ${color.dim(`${olderMessages.length} older turns summarized, ${COMPACT_KEEP_RECENT} recent kept`)}\n`,
  );

  log.debug('Auto-compact done', {
    olderSummarized: olderMessages.length,
    recentKept: COMPACT_KEEP_RECENT,
    summaryTokens: afterEstimate,
    originalTokens: beforeTokens,
    ratio: beforeTokens > 0 ? ((afterEstimate / beforeTokens) * 100).toFixed(1) + '%' : 'N/A',
  });
}

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

    attachStreamHandler(bridge, ctx, spinner);

    // Dynamic timeout
    const timeoutMs =
      classification.complexity >= 0.7
        ? 600_000
        : classification.complexity >= 0.4
          ? 300_000
          : 120_000;

    const permMode = process.env.NEO_PERMISSION_MODE || 'default';

    // Inject compacted context from /compact into system prompt
    let effectiveSystemPrompt = systemPrompt;
    if (compactedContext) {
      effectiveSystemPrompt += `\n\n## Compacted Context (from previous conversation)\n\nThe conversation was compacted. Below is a summary of the key context from the previous turns. Use this to maintain continuity.\n\n${compactedContext}`;
      log.debug('Compacted context injected', { summaryLength: compactedContext.length });
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
    const lower = sanitized.content.toLowerCase();
    const isDebugIntent =
      /\b(debug|diagnose|trace|inspect|self-debug)\b/.test(lower) ||
      /\b(what happened|why did you|what went wrong|how did you|what did you do)\b/.test(lower) ||
      /\b(too slow|took too long|wrong answer|incorrect|you (were|are) wrong|broke|broken|failing)\b/.test(
        lower,
      ) ||
      /\b(how do you work|your (logs?|pipeline|process|routing|thinking)|show me your|explain your)\b/.test(
        lower,
      ) ||
      /\b(something (is )?wrong|not working|didn'?t work|error|issue|problem|bug)\b/.test(lower);

    if (isDebugIntent) {
      const recentLogs = getRecentLogs(100);
      if (recentLogs.length > 0) {
        const logText = recentLogs
          .map((e) => {
            const data =
              e.data && Object.keys(e.data).length > 0 ? ` ${JSON.stringify(e.data)}` : '';
            const err = e.error ? ` ERROR: ${e.error.message}` : '';
            return `[${e.timestamp.slice(11, 23)}] ${e.level.toUpperCase()} [${e.namespace}] ${e.message}${data}${err}`;
          })
          .join('\n');
        runOpts.systemPrompt += `\n\n## Self-Debug Context\n\nThe user appears to be asking about your behavior, performance, or a problem they encountered. Below are your recent internal pipeline logs — use them to explain what happened, diagnose issues, or reason about your own processing. Be transparent and helpful.\n\n<debug_logs>\n${logText}\n</debug_logs>`;
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
      attachStreamHandler(bridge, ctx, spinner);
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
      attachStreamHandler(bridge, ctx, spinner);
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
    if (ctx.sdkSessionId) {
      s.sdkSessionId = ctx.sdkSessionId;
      if (compactedContext) {
        log.debug('Compacted context absorbed into SDK session');
        compactedContext = null;
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

    // Auto-compact if we've hit the turn threshold
    await autoCompactIfNeeded();

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
        lastCompactionInfo,
        s.turns,
        AUTO_COMPACT_TURN_THRESHOLD,
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
  const lines = [
    `# Neo Session Export`,
    ``,
    `**Session:** \`${s.id}\`  `,
    `**Date:** ${date}  `,
    `**Turns:** ${s.turns}  `,
    `**Tokens:** ${fmtTokens(s.totalInputTokens + s.totalOutputTokens)}  `,
    `**Cost:** ${fmtCost(s.totalCost)}  `,
    ``,
    `---`,
    ``,
  ];
  for (const m of history) {
    lines.push(`## ${m.role === 'user' ? '👤 You' : '🤖 Neo'}`);
    lines.push(``);
    lines.push((m as any).content ?? '');
    lines.push(``);
  }
  const { writeFileSync } = await import('fs');
  writeFileSync(filename, lines.join('\n'));
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
  compact: runCompact,
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
      rl.setPrompt(buildPrompt(sessionMgr.current.id));
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
    rl.setPrompt(buildPrompt(sessionMgr.current.id));
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
