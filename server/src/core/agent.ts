/**
 * ░▒▓ NEO AGENT ▓▒░
 *
 * "I know why you're here, Neo. I know what you've been doing."
 *
 * The main orchestrator — 10-step pipeline:
 * media → guardrails → session → context → route → gate → execute → harness → memory → deliver
 *
 * All behavioral features live here so every channel (CLI, Telegram, web) gets them.
 */

import type {
  AgentResponse,
  InboundMessage,
  ModelTier,
  NeoConfig,
  Session,
} from '@neo-agent/shared';
import type Database from 'better-sqlite3';
import { join } from 'path';
import { Orchestrator } from '../agents/orchestrator.js';
import { AgentRegistry } from '../agents/registry.js';
import { SubAgentSpawner } from '../agents/spawner.js';
import { GateManager } from '../gates/index.js';
import { GuardrailPipeline } from '../guardrails/index.js';
import { HarnessPipeline } from '../harness/index.js';
import { MediaProcessor, type MediaConfig } from '../media/media-processor.js';
import { LongTermMemory, MemoryExtractor, SessionTranscript } from '../memory/index.js';
import { TaskClassifier, type ClassifierContext } from '../router/classifier.js';
import { RouterEngine } from '../router/engine.js';
import { SkillMatcher } from '../skills/matcher.js';
import { SkillRegistry } from '../skills/registry.js';
import { logger } from '../utils/logger.js';
import {
  calculateTimeoutMs,
  formatDebugLogs,
  injectCompactedContext,
  injectDebugContext,
  isDebugIntent,
  isShortFollowup,
} from '../utils/patterns.js';
import { getRecentLogs } from '../utils/logger.js';
import { ClaudeBridge } from './claude-bridge.js';
import { ErrorRecovery } from './error-recovery.js';
import { SessionQueue } from './session-queue.js';
import { SessionManager } from './session.js';

const log = logger('agent');

export class NeoAgent {
  private bridge: ClaudeBridge;
  private guardrails: GuardrailPipeline;
  private harness: HarnessPipeline;
  private gates: GateManager;
  private sessions: SessionManager;
  private queue: SessionQueue;
  private recovery: ErrorRecovery;
  private config: NeoConfig;
  private classifier: TaskClassifier;
  private router: RouterEngine;
  private skillRegistry: SkillRegistry;
  private skillMatcher: SkillMatcher;
  private mediaProcessor: MediaProcessor | null;
  private agentRegistry: AgentRegistry;
  private orchestrator: Orchestrator;
  private transcript: SessionTranscript;
  private longTermMemory: LongTermMemory;
  private memoryExtractor: MemoryExtractor;

  // Per-session state for cross-channel features
  private modelOverrides = new Map<string, ModelTier>();
  private lastInputs = new Map<string, string>();
  private compactedContexts = new Map<string, string>();
  private neoDevModes = new Map<string, boolean>();
  private autoCompactThreshold: number;
  private costBudget: number;

  constructor(db: Database.Database, config: NeoConfig) {
    this.config = config;
    this.bridge = new ClaudeBridge();
    this.guardrails = new GuardrailPipeline();
    this.harness = new HarnessPipeline({ db });
    this.gates = new GateManager({
      freeWill: { enabled: true, approvalPhrase: config.gatePhrase },
      fileGuard: { enabled: true, protectedPaths: config.protectedPaths },
      costGate: { enabled: true, warnThreshold: 0.7 },
    });
    this.sessions = new SessionManager(db, config.defaultModel);
    this.queue = new SessionQueue();
    this.recovery = new ErrorRecovery(this.harness.historian, {
      savePartialTranscript: async () => {},
    });

    // Phase 3 — Dodge This: Smart Router
    this.classifier = new TaskClassifier();
    this.router = new RouterEngine(db);

    // Phase 6 — Kung Fu: Skill calling & learning
    this.skillRegistry = new SkillRegistry();
    this.skillRegistry.loadFromDirectory(join(config.workspacePath, 'skills'));
    this.skillMatcher = new SkillMatcher(this.skillRegistry);

    // Phase 7 — The Ones: Sub-agent orchestration
    this.agentRegistry = new AgentRegistry();
    this.agentRegistry.loadFromDirectory(join(config.workspacePath, 'agents'));
    const spawner = new SubAgentSpawner(this.bridge, '/tmp/neo-agents');
    this.orchestrator = new Orchestrator(spawner, this.agentRegistry, db);

    // Memory
    this.transcript = new SessionTranscript(db);
    this.longTermMemory = new LongTermMemory(db);
    this.memoryExtractor = new MemoryExtractor();

    // Config
    this.autoCompactThreshold = parseInt(process.env.NEO_AUTO_COMPACT_TURNS ?? '15', 10);
    this.costBudget = parseFloat(process.env.NEO_COST_BUDGET ?? '0');

    // Phase 5 — Phone Lines: Media processing (optional — needs GROQ_API_KEY)
    const groqKey = process.env.GROQ_API_KEY;
    this.mediaProcessor = groqKey
      ? new MediaProcessor({
          groqApiKey: groqKey,
          maxVoiceDurationSeconds: 300,
          maxImageSizeMb: 10,
          maxDocumentSizeMb: 25,
          tempDir: '/tmp/neo-media',
          cleanupAfterMinutes: 30,
        })
      : null;
  }

  // ─── Public API ────────────────────────────────────────────

  async handleMessage(message: InboundMessage): Promise<AgentResponse> {
    this.lastInputs.set(message.sessionKey, message.content);
    return this.queue.enqueue(message.sessionKey, async () => {
      try {
        return await this._executeLoop(message);
      } catch (err) {
        return this.recovery.handle(err, message);
      }
    });
  }

  /** Set a one-shot model override for the next message on a session key. */
  setModelOverride(sessionKey: string, model: ModelTier): void {
    this.modelOverrides.set(sessionKey, model);
  }

  /** Get the last user input for a session key (for /retry). */
  getLastInput(sessionKey: string): string | undefined {
    return this.lastInputs.get(sessionKey);
  }

  /** Get the transcript instance (for /export). */
  getTranscript(): SessionTranscript {
    return this.transcript;
  }

  /** Get the session manager (for session commands). */
  getSessionManager(): SessionManager {
    return this.sessions;
  }

  /** Toggle neo-dev mode: agent can freely edit the neo-agent codebase. */
  setNeoDevMode(sessionKey: string, on: boolean): void {
    this.neoDevModes.set(sessionKey, on);
    log.debug('Neo-Dev mode toggled', { sessionKey, on });
  }

  /** Check if neo-dev mode is active for a session. */
  isNeoDevMode(sessionKey: string): boolean {
    return this.neoDevModes.get(sessionKey) ?? false;
  }

  // ─── Core Pipeline ─────────────────────────────────────────

  private async _executeLoop(message: InboundMessage): Promise<AgentResponse> {
    log.debug('Pipeline start', {
      channel: message.channel,
      userId: message.userId,
      contentLength: message.content.length,
    });

    // 0. Media processing (voice → text, image → analysis, document → text)
    const enriched = this.mediaProcessor ? await this.mediaProcessor.process(message) : message;
    if (this.mediaProcessor) log.debug('Media processed', { hasMedia: enriched !== message });

    // 1. Guardrails
    const sanitized = await this.guardrails.process(enriched);
    log.debug('Guardrails passed', { modified: sanitized.content !== enriched.content });

    // 2. Session
    const session = this.sessions.resolveOrCreate(
      message.channelId,
      message.userId,
      message.channel,
    );
    log.debug('Session resolved', { sessionId: session.id, totalTokens: session.totalTokens ?? 0 });

    // 3. Context assembly — system prompt + compacted context + debug injection
    let systemPrompt = this.buildSystemPrompt(session, sanitized.content);

    // Inject compacted context if available
    const compacted = this.compactedContexts.get(message.sessionKey);
    if (compacted) {
      systemPrompt = injectCompactedContext(systemPrompt, compacted);
      log.debug('Compacted context injected', { summaryLength: compacted.length });
    }

    // Self-debug context injection
    if (isDebugIntent(sanitized.content)) {
      const recentLogs = getRecentLogs(100);
      if (recentLogs.length > 0) {
        systemPrompt = injectDebugContext(systemPrompt, formatDebugLogs(recentLogs));
        log.debug('Debug context injected', { logCount: recentLogs.length });
      }
    }

    // 4. Route — classify then select optimal model tier (Phase 3)
    const context: ClassifierContext = {
      tokenCount: session.totalTokens ?? 0,
      hasActiveTools: false,
    };
    const classification = this.classifier.classify(sanitized.content, context);
    log.debug('Task classified', {
      complexity: classification.complexity,
      tokenEstimate: classification.tokenEstimate,
    });

    const route = this.router.selectModel(classification, this.config.routingProfile);
    log.debug('Route selected', {
      model: route.selectedModel,
      score: route.score,
      maxTurns: route.maxTurns,
    });

    // 4a. One-shot model override (/model command)
    const override = this.modelOverrides.get(message.sessionKey);
    if (override) {
      log.debug('Model override applied', { from: route.selectedModel, to: override });
      route.selectedModel = override;
      this.modelOverrides.delete(message.sessionKey);
    } else if (isShortFollowup(sanitized.content) && session.lastModelTier) {
      // Short followup model reuse
      log.debug('Short followup, reusing model', { model: session.lastModelTier });
      route.selectedModel = session.lastModelTier;
    }

    // 4b. Decomposition check — delegate to sub-agents if complex (Phase 7)
    const decompose = this.orchestrator.shouldDecompose(sanitized);
    if (decompose.shouldDecompose) {
      log.debug('Decomposing to sub-agents', { pattern: decompose.suggestedPattern });
      const team = this.orchestrator.createTeam(
        decompose.suggestedPattern,
        [{ id: `task-${Date.now()}`, blueprintName: 'planner', prompt: sanitized.content }],
        session.id,
      );
      const completedTeam = await this.orchestrator.executeTeam(team);
      log.debug('Sub-agents completed', { resultCount: completedTeam.results.length });
      const output = completedTeam.results
        .map(
          (r) =>
            `[${r.agentName}] ${typeof r.output === 'string' ? r.output : JSON.stringify(r.output)}`,
        )
        .join('\n\n');
      const teamContent = output || 'Sub-agents completed but produced no output.';
      this.recordTranscript(session.id, sanitized.content, teamContent);
      this.extractMemories(sanitized.content, session.id);
      return {
        content: teamContent,
        model: route.selectedModel,
      };
    }

    // 5. Gate check (PRE-EXECUTION scope)
    const gateResult = await this.gates.check(sanitized, {
      ...route,
      requiresExecution: this.looksLikeExecution(sanitized.content),
    });

    if (gateResult.blocked) {
      log.debug('Gate blocked', { reason: gateResult.reason });
      this.harness.historian.logGateBlock(session.id, gateResult);
      return {
        content: gateResult.neoQuip ?? gateResult.reason ?? 'Blocked by gate.',
        model: route.selectedModel,
        gateBlocked: gateResult,
      };
    }
    log.debug('Gates passed');

    // 6. Execute via Claude Bridge
    const timeoutMs = calculateTimeoutMs(classification.complexity);
    const isNeoDev = this.neoDevModes.get(message.sessionKey) ?? false;

    const runOpts: any = {
      cwd: isNeoDev ? process.cwd().replace(/\/server$/, '') : this.config.workspacePath,
      model: route.selectedModel,
      permissionMode: isNeoDev ? 'bypassPermissions' : this.config.permissionMode,
      allowDangerouslySkipPermissions: isNeoDev,
      allowedTools: route.allowedTools ?? [
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
      systemPrompt,
      maxTurns: route.maxTurns,
      timeoutMs,
    };

    // Session resume via SDK session ID
    if (session.sdkSessionId) {
      runOpts.resumeSessionId = session.sdkSessionId;
      log.debug('Resuming SDK session', { sdkSessionId: session.sdkSessionId });
    }

    log.debug('Executing bridge', { model: route.selectedModel, maxTurns: route.maxTurns });
    let response = await this.bridge.run(sanitized.content, runOpts);
    log.debug('Bridge result', { success: response.success });

    // If resume failed, retry as fresh conversation
    if (!response.success && runOpts.resumeSessionId) {
      log.debug('Resume failed, retrying as fresh conversation');
      delete runOpts.resumeSessionId;
      this.sessions.updateExtendedState(session.id, { sdkSessionId: undefined });
      response = await this.bridge.run(sanitized.content, runOpts);
      log.debug('Fresh retry result', { success: response.success });
    }

    // Auto-retry on timeout
    const isTimeout =
      !response.success &&
      ((response.error ?? '').toLowerCase().includes('timeout') ||
        (response.message ?? '').toLowerCase().includes('timeout') ||
        (response.error ?? '').includes('ABORT_SIGNAL'));
    if (isTimeout) {
      log.debug('Timeout detected, auto-retrying', { originalMaxTurns: runOpts.maxTurns });
      const retryOpts = {
        ...runOpts,
        maxTurns: Math.max(1, Math.ceil((runOpts.maxTurns ?? 10) / 2)),
        resumeSessionId: undefined,
      };
      delete retryOpts.resumeSessionId;
      response = await this.bridge.run(sanitized.content, retryOpts);
      log.debug('Auto-retry result', { success: response.success });
    }

    // Capture SDK session ID from response messages
    const sdkSessionId = this.extractSdkSessionId(response);

    // 7. Harness
    const validated = await this.harness.process(response, session);
    log.debug('Harness validated', { tokensUsed: validated.tokensUsed });

    // 8. Memory — update session state, record transcript, extract memories
    const bridgeData = validated.data as
      | { inputTokens?: number; outputTokens?: number; costUsd?: number }
      | undefined;
    const inputTokens = bridgeData?.inputTokens ?? 0;
    const outputTokens = validated.tokensUsed ?? 0;
    const costUsd = bridgeData?.costUsd ?? 0;

    if (response.success) {
      this.sessions.updateTokens(session.id, outputTokens);
    }

    // Update extended session state
    const newTurns = (session.turns ?? 0) + 1;
    const newInputTokens = (session.totalInputTokens ?? 0) + inputTokens;
    const newOutputTokens = (session.totalOutputTokens ?? 0) + outputTokens;
    const newCost = (session.totalCost ?? 0) + costUsd;
    this.sessions.updateExtendedState(session.id, {
      sdkSessionId: sdkSessionId ?? session.sdkSessionId,
      lastModelTier: route.selectedModel,
      turns: newTurns,
      totalInputTokens: newInputTokens,
      totalOutputTokens: newOutputTokens,
      totalCost: newCost,
    });

    // Clear compacted context once SDK session absorbs it
    if (sdkSessionId && this.compactedContexts.has(message.sessionKey)) {
      log.debug('Compacted context absorbed into SDK session');
      this.compactedContexts.delete(message.sessionKey);
    }

    // Record transcript
    const responseContent = validated.validatedContent ?? validated.content ?? '';
    this.recordTranscript(session.id, sanitized.content, responseContent, outputTokens);

    // Extract memories
    this.extractMemories(sanitized.content, session.id);

    // Auto-compact check
    this.autoCompactIfNeeded(session, message.sessionKey, newTurns).catch((err) =>
      log.debug('Auto-compact failed', { error: String(err) }),
    );

    // 9. Deliver
    const warnings: string[] = [];
    if (this.costBudget > 0 && newCost > this.costBudget) {
      warnings.push(
        `Session cost $${newCost.toFixed(4)} has exceeded budget $${this.costBudget.toFixed(4)}`,
      );
    }

    log.debug('Pipeline complete', {
      model: route.selectedModel,
      tokensUsed: outputTokens,
      turns: newTurns,
    });
    return {
      content: responseContent,
      model: route.selectedModel,
      tokensUsed: outputTokens,
      inputTokens,
      costUsd,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  // ─── System Prompt ──────────────────────────────────────────

  private buildSystemPrompt(session: any, query?: string): string {
    const base = `You are ${this.config.agentName}, a personal AI agent for ${this.config.userName}. Session: ${session.id}\n\nFormat your responses using markdown when appropriate: **bold** for emphasis, \`code\` for technical terms, code blocks for snippets, - for lists, and [text](url) for links. Keep formatting natural and readable — don't over-format simple replies.`;

    if (!query) return base;

    // Inject relevant skill contexts (Phase 6 — Kung Fu)
    const skillContexts = this.skillMatcher.getActiveContexts(query);
    if (skillContexts.length === 0) return base;

    return [base, '', '# Active Skills', '', ...skillContexts].join('\n');
  }

  // ─── Transcript & Memory ────────────────────────────────────

  private recordTranscript(
    sessionId: string,
    userContent: string,
    assistantContent: string,
    tokens?: number,
  ): void {
    try {
      this.transcript.record(sessionId, 'user', userContent);
      if (assistantContent) {
        this.transcript.record(sessionId, 'assistant', assistantContent, tokens);
      }
    } catch (err) {
      log.debug('Transcript recording failed', { sessionId, error: (err as Error).message });
    }
  }

  private extractMemories(userContent: string, sessionId: string): void {
    try {
      const extracted = this.memoryExtractor.extractFromMessage(userContent, sessionId);
      for (const entry of extracted) {
        this.longTermMemory.store(entry);
      }
      if (extracted.length > 0) {
        log.debug('Memories extracted', { count: extracted.length });
      }
    } catch (err) {
      log.debug('Memory extraction failed', { error: (err as Error).message });
    }
  }

  // ─── Auto-Compaction ────────────────────────────────────────

  private async autoCompactIfNeeded(
    session: Session,
    sessionKey: string,
    turns: number,
  ): Promise<void> {
    if (turns < this.autoCompactThreshold) return;
    if (turns % this.autoCompactThreshold !== 0) return;

    const history = this.transcript.getHistory(session.id, 200);
    const keepRecent = 20;
    if (history.length <= keepRecent) return;

    log.debug('Auto-compact triggered', { turns, messageCount: history.length });

    const olderMessages = history.slice(0, -keepRecent);
    const existing = this.compactedContexts.get(sessionKey);
    const messagesToSummarize = existing
      ? [
          { role: 'system' as string, content: `[Previous summary]:\n${existing}` },
          ...olderMessages,
        ]
      : olderMessages;

    const conversationText = messagesToSummarize
      .map((m) => `[${(m as any).role}]: ${((m as any).content ?? '').slice(0, 10000)}`)
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

## User Preferences & Style
- Communication preferences, workflow patterns

## Active Tasks & Open Items
- What was being worked on
- Unresolved questions or next steps

## Important Facts
- Any facts, credentials, names, or specifics needed to continue

Be thorough — preserve ALL specific details.

<conversation>
${conversationText}
</conversation>`;

    try {
      const result = await this.bridge.run(compactPrompt, {
        cwd: this.config.workspacePath,
        model: 'sonnet',
        maxTurns: 1,
        timeoutMs: 60_000,
        systemPrompt:
          'You are a context compaction assistant. Produce structured, detailed summaries that preserve all actionable information. Output only the summary.',
      });

      if (!result.success || !result.data) {
        log.debug('Auto-compact failed', { error: result.error });
        return;
      }

      const summary =
        typeof result.data === 'string' ? result.data : ((result.data as any).content ?? '');
      if (!summary) return;

      const recentMessages = history.slice(-keepRecent);
      const parts: string[] = [summary, '\n## Recent Messages (verbatim)\n'];
      for (const m of recentMessages) {
        const content = (m as any).content ?? '';
        const truncated = content.length > 3000 ? content.slice(0, 3000) + '...' : content;
        parts.push(`**${(m as any).role}**: ${truncated}\n`);
      }

      this.compactedContexts.set(sessionKey, parts.join('\n'));

      // Break SDK session to start fresh with compacted context
      this.sessions.updateExtendedState(session.id, { sdkSessionId: undefined });

      log.debug('Auto-compact done', {
        olderSummarized: olderMessages.length,
        recentKept: keepRecent,
      });
    } catch (err) {
      log.debug('Auto-compact error', { error: String(err) });
    }
  }

  // ─── Helpers ────────────────────────────────────────────────

  private extractSdkSessionId(response: any): string | undefined {
    const messages = response?.data?.messages;
    if (!Array.isArray(messages)) return undefined;
    for (const msg of messages) {
      if (msg.session_id) return msg.session_id;
    }
    return undefined;
  }

  private looksLikeExecution(content: string): boolean {
    const lower = content.toLowerCase();
    return (
      lower.includes('deploy') ||
      lower.includes('run') ||
      lower.includes('execute') ||
      lower.includes('write') ||
      lower.includes('delete') ||
      lower.includes('install') ||
      lower.includes('push') ||
      lower.includes('commit')
    );
  }
}
