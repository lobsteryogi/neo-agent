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
import { NeoHome } from './neo-home.js';
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
  DEFAULT_AGENT_TOOLS,
  formatDebugLogs,
  injectCompactedContext,
  injectDebugContext,
  isDebugIntent,
  isShortFollowup,
  isTimeoutResult,
} from '../utils/patterns.js';
import { getRecentLogs } from '../utils/logger.js';
import { UserProfileRepo } from '../db/user-profile-repo.js';
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
  private userProfiles: UserProfileRepo;

  // Per-session state for cross-channel features
  // modelOverrides, lastInputs, neoDevModes are keyed by userKey (per-user in groups)
  private modelOverrides = new Map<string, ModelTier>();
  private lastInputs = new Map<string, string>();
  private neoDevModes = new Map<string, boolean>();
  // compactedContexts is keyed by sessionKey (shared in groups)
  private compactedContexts = new Map<string, string>();
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
    this.skillRegistry.loadFromDirectory(NeoHome.skills);
    this.skillMatcher = new SkillMatcher(this.skillRegistry);

    // Phase 7 — The Ones: Sub-agent orchestration
    this.agentRegistry = new AgentRegistry();
    this.agentRegistry.loadFromDirectory(NeoHome.agents);
    const spawner = new SubAgentSpawner(this.bridge, NeoHome.tmpAgents);
    this.orchestrator = new Orchestrator(spawner, this.agentRegistry, db);

    // Memory
    this.transcript = new SessionTranscript(db);
    this.longTermMemory = new LongTermMemory(db);
    this.memoryExtractor = new MemoryExtractor();
    this.userProfiles = new UserProfileRepo(db);

    // Config
    this.autoCompactThreshold = parseInt(process.env.NEO_AUTO_COMPACT_TURNS ?? '15', 10);
    if (isNaN(this.autoCompactThreshold)) this.autoCompactThreshold = 15;
    this.costBudget = parseFloat(process.env.NEO_COST_BUDGET ?? '0');
    if (isNaN(this.costBudget)) this.costBudget = 0;

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

  /**
   * Build a per-user key for user-specific settings (model, retry, dev mode).
   * In group chats, different users get different keys.
   * In DMs / CLI, this equals the sessionKey.
   */
  private userKey(message: InboundMessage): string {
    return message.metadata?.isGroup
      ? `${message.sessionKey}:${message.userId}`
      : message.sessionKey;
  }

  private static NAME_PREFIX_RE = /^(i'?m|i am|my name is|call me|it'?s|it is)\s+/i;

  async handleMessage(message: InboundMessage): Promise<AgentResponse> {
    this.lastInputs.set(this.userKey(message), message.content);

    // Telegram DM onboarding — ask new users for their name
    // Skip for: groups, empty userId, slash commands, media-only messages
    if (
      message.channel === 'telegram' &&
      !message.metadata?.isGroup &&
      message.userId &&
      message.userId.length > 0 &&
      !message.content.trim().startsWith('/') &&
      !message.attachments?.length
    ) {
      const profileId = `telegram:${message.userId}`;
      const profile = this.userProfiles.get(profileId);

      if (!profile) {
        // First contact — create profile and ask for name
        this.userProfiles.upsert(profileId, 'telegram', {});
        log.debug('New Telegram DM user, requesting name', { profileId });
        return {
          content: `Hey there! 🕶️ I'm ${this.config.agentName}.\n\nWhat's your name? I'd like to know who I'm talking to.`,
          model: 'sonnet',
        };
      }

      if (!profile.onboarded) {
        // They're replying with their name
        const name = message.content.trim().replace(NeoAgent.NAME_PREFIX_RE, '').trim();
        if (name && name.length > 0 && name.length < 50) {
          this.userProfiles.upsert(profileId, 'telegram', { displayName: name, onboarded: true });
          log.debug('User onboarded', { profileId, name });
          return {
            content: `Nice to meet you, **${name}**! 🕶️\n\nI'm ready to help. Just send me a message anytime.`,
            model: 'sonnet',
          };
        }
        // Doesn't look like a name — onboard with Telegram display name as fallback
        const fallbackName = (message.metadata?.senderName as string) || undefined;
        this.userProfiles.upsert(profileId, 'telegram', {
          displayName: fallbackName,
          onboarded: true,
        });
      }
    }

    return this.queue.enqueue(message.sessionKey, async () => {
      try {
        return await this._executeLoop(message);
      } catch (err) {
        return this.recovery.handle(err, message);
      }
    });
  }

  /**
   * Set a one-shot model override.
   * Key should be a userKey (per-user in groups) or sessionKey (DMs/CLI).
   */
  setModelOverride(key: string, model: ModelTier): void {
    this.modelOverrides.set(key, model);
  }

  /**
   * Get the last user input (for /retry).
   * Key should be a userKey (per-user in groups) or sessionKey (DMs/CLI).
   */
  getLastInput(key: string): string | undefined {
    return this.lastInputs.get(key);
  }

  /** Get the transcript instance (for /export). */
  getTranscript(): SessionTranscript {
    return this.transcript;
  }

  /** Get the session manager (for session commands). */
  getSessionManager(): SessionManager {
    return this.sessions;
  }

  /**
   * Observe a group message without triggering the agent pipeline.
   * Records it into the group session transcript so the bot has context
   * when it IS tagged later.
   */
  observeGroupMessage(message: InboundMessage): void {
    if (!message.metadata?.isGroup) return;
    const sessionUserId = `group:${message.channelId}`;
    const session = this.sessions.resolveOrCreate(
      message.channelId,
      sessionUserId,
      message.channel,
    );
    const senderName = (message.metadata?.senderName as string) ?? message.userId;

    // Build display content — add media descriptor if text is empty
    let displayContent = message.content;
    if (!displayContent && message.attachments?.length) {
      const types = message.attachments.map((a) => a.type).join(', ');
      displayContent = `(${types})`;
    }
    if (!displayContent) return; // Nothing to record

    const content = `[${senderName}]: ${displayContent}`;
    try {
      this.transcript.record(session.id, 'user', content);
      log.debug('Group message observed', { sessionId: session.id, senderName });
    } catch (err) {
      log.debug('Group observation failed', { error: (err as Error).message });
    }
  }

  /**
   * Toggle neo-dev mode. Disabled in group chats for security.
   * Key should be a userKey or sessionKey.
   */
  setNeoDevMode(key: string, on: boolean): void {
    this.neoDevModes.set(key, on);
    log.debug('Neo-Dev mode toggled', { key, on });
  }

  /** Check if neo-dev mode is active. */
  isNeoDevMode(key: string): boolean {
    return this.neoDevModes.get(key) ?? false;
  }

  // ─── Core Pipeline ─────────────────────────────────────────

  private async _executeLoop(message: InboundMessage): Promise<AgentResponse> {
    const isGroup = !!message.metadata?.isGroup;
    const uKey = this.userKey(message);
    const senderName = (message.metadata?.senderName as string) ?? undefined;

    log.info('Incoming', {
      channel: message.channel,
      senderName,
      content: message.content.slice(0, 200),
      isGroup,
    });

    // 0. Media processing (voice → text, image → analysis, document → text)
    const enriched = this.mediaProcessor ? await this.mediaProcessor.process(message) : message;
    if (this.mediaProcessor && enriched !== message)
      log.info('Media processed', { hasMedia: true });

    // 1. Guardrails
    const sanitized = await this.guardrails.process(enriched);
    if (sanitized.content !== enriched.content)
      log.info('Guardrails modified input', { modified: true });

    // 2. Session — group chats share one session keyed by channelId
    const sessionUserId = isGroup ? `group:${message.channelId}` : message.userId;
    const session = this.sessions.resolveOrCreate(
      message.channelId,
      sessionUserId,
      message.channel,
    );
    log.debug('Session', { sessionId: session.id, totalTokens: session.totalTokens ?? 0 });

    // 3. Context assembly — system prompt + compacted context + debug injection
    let systemPrompt = this.buildSystemPrompt(session, message);

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
    const route = this.router.selectModel(classification, this.config.routingProfile);
    log.info('Routed', {
      model: route.selectedModel,
      complexity: classification.complexity,
      tokenEstimate: classification.tokenEstimate,
      maxTurns: route.maxTurns,
    });

    // 4a. One-shot model override (/model command) — per-user in groups
    const override = this.modelOverrides.get(uKey);
    if (override) {
      log.info('Model override', { from: route.selectedModel, to: override });
      route.selectedModel = override;
      this.modelOverrides.delete(uKey);
    } else if (isShortFollowup(sanitized.content) && session.lastModelTier) {
      log.info('Short followup, reusing model', { model: session.lastModelTier });
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
      log.warn('Gate blocked', { reason: gateResult.reason });
      this.harness.historian.logGateBlock(session.id, gateResult);
      return {
        content: gateResult.neoQuip ?? gateResult.reason ?? 'Blocked by gate.',
        model: route.selectedModel,
        gateBlocked: gateResult,
      };
    }

    // 6. Execute via Claude Bridge
    const timeoutMs = calculateTimeoutMs(classification.complexity);
    // Neo-dev mode is per-user and disabled in groups for security
    const isNeoDev = isGroup ? false : (this.neoDevModes.get(uKey) ?? false);

    // Resolve per-context workspace: groups use channelId, DMs use userId
    const workspaceContextId = isGroup ? `group:${message.channelId}` : message.userId;
    const workspaceCwd = NeoHome.workspace(message.channel, workspaceContextId);

    const runOpts: any = {
      cwd: isNeoDev ? process.cwd().replace(/\/server$/, '') : workspaceCwd,
      model: route.selectedModel,
      permissionMode: isNeoDev ? 'dontAsk' : this.config.permissionMode,
      allowedTools: route.allowedTools ?? [...DEFAULT_AGENT_TOOLS],
      systemPrompt,
      maxTurns: route.maxTurns,
      timeoutMs,
    };

    // Session resume via SDK session ID
    if (session.sdkSessionId) {
      runOpts.resumeSessionId = session.sdkSessionId;
      log.debug('Resuming session', { sdkSessionId: session.sdkSessionId });
    }

    log.info('Bridge call', {
      model: route.selectedModel,
      maxTurns: route.maxTurns,
      resume: !!session.sdkSessionId,
    });
    let response = await this.bridge.run(sanitized.content, runOpts);

    // If resume failed, retry as fresh conversation
    if (!response.success && runOpts.resumeSessionId) {
      log.warn('Resume failed, retrying fresh');
      delete runOpts.resumeSessionId;
      this.sessions.updateExtendedState(session.id, { sdkSessionId: undefined });
      response = await this.bridge.run(sanitized.content, runOpts);
    }

    // Auto-retry on timeout
    if (isTimeoutResult(response)) {
      log.warn('Timeout, auto-retrying', { maxTurns: runOpts.maxTurns });
      const retryOpts = {
        ...runOpts,
        maxTurns: Math.max(1, Math.ceil((runOpts.maxTurns ?? 10) / 2)),
        resumeSessionId: undefined,
      };
      delete retryOpts.resumeSessionId;
      response = await this.bridge.run(sanitized.content, retryOpts);
    }

    // Capture SDK session ID from response messages
    const sdkSessionId = this.extractSdkSessionId(response);

    // 7. Harness
    const validated = await this.harness.process(response, session);

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

    // Record transcript (prefix with sender name in groups for attribution)
    const responseContent = validated.validatedContent ?? validated.content ?? '';
    const transcriptContent =
      isGroup && senderName ? `[${senderName}]: ${sanitized.content}` : sanitized.content;
    this.recordTranscript(session.id, transcriptContent, responseContent, outputTokens);

    // Extract memories (with sender attribution in groups)
    this.extractMemories(sanitized.content, session.id, senderName);

    // Auto-compact check
    this.autoCompactIfNeeded(session, message.sessionKey, newTurns).catch((err) =>
      log.warn('Auto-compact failed', { error: String(err) }),
    );

    // 9. Deliver
    const warnings: string[] = [];
    if (this.costBudget > 0 && newCost > this.costBudget) {
      warnings.push(
        `Session cost $${newCost.toFixed(4)} has exceeded budget $${this.costBudget.toFixed(4)}`,
      );
    }

    log.info('Done', {
      model: route.selectedModel,
      success: response.success,
      turns: newTurns,
      tokensUsed: outputTokens,
      costUsd,
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

  private buildSystemPrompt(session: Session, message: InboundMessage): string {
    // Resolve the user's display name — per-user profile for Telegram DMs, global fallback otherwise
    let userName = this.config.userName;
    if (message.channel === 'telegram' && message.userId && !message.metadata?.isGroup) {
      const profile = this.userProfiles.get(`telegram:${message.userId}`);
      if (profile?.displayName) userName = profile.displayName;
    }

    let base = `You are ${this.config.agentName}, a personal AI agent for ${userName}. Session: ${session.id}\n\nFormat your responses using markdown when appropriate: **bold** for emphasis, \`code\` for technical terms, code blocks for snippets, - for lists, and [text](url) for links. Keep formatting natural and readable — don't over-format simple replies.`;

    // Group chat awareness
    const metadata = message.metadata;
    if (metadata?.isGroup) {
      const sender = metadata.senderName ?? 'a user';
      base += `\n\nYou are in a Telegram group chat. This message is from **${sender}**. Address them by name when relevant. Multiple people may be in this conversation — keep track of who said what.`;
    }

    if (!message.content) return base;

    // Inject relevant skill contexts (Phase 6 — Kung Fu)
    const skillContexts = this.skillMatcher.getActiveContexts(message.content);
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

  private extractMemories(userContent: string, sessionId: string, senderName?: string): void {
    try {
      const extracted = this.memoryExtractor.extractFromMessage(userContent, sessionId);
      for (const entry of extracted) {
        // Tag with sender for attribution in group chats
        if (senderName) {
          entry.tags = [...(entry.tags ?? []), `sender:${senderName}`];
        }
        this.longTermMemory.store(entry);
      }
      if (extracted.length > 0) {
        log.info('Memories extracted', { count: extracted.length, senderName });
      }
    } catch (err) {
      log.warn('Memory extraction failed', { error: (err as Error).message });
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

    log.info('Auto-compact triggered', { turns, messageCount: history.length });

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
        cwd: NeoHome.workspace('cli', 'cli'),
        model: 'sonnet',
        maxTurns: 1,
        timeoutMs: 60_000,
        systemPrompt:
          'You are a context compaction assistant. Produce structured, detailed summaries that preserve all actionable information. Output only the summary.',
      });

      if (!result.success || !result.data) {
        log.warn('Auto-compact failed', { error: result.error });
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

      log.info('Auto-compact done', {
        olderSummarized: olderMessages.length,
        recentKept: keepRecent,
      });
    } catch (err) {
      log.warn('Auto-compact error', { error: String(err) });
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
