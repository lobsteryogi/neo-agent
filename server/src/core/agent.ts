/**
 * ░▒▓ NEO AGENT ▓▒░
 *
 * "I know why you're here, Neo. I know what you've been doing."
 *
 * The main orchestrator — 10-step pipeline:
 * media → guardrails → session → context → route → gate → execute → harness → memory → deliver
 */

import type { AgentResponse, InboundMessage, NeoConfig } from '@neo-agent/shared';
import type Database from 'better-sqlite3';
import { join } from 'path';
import { Orchestrator } from '../agents/orchestrator.js';
import { AgentRegistry } from '../agents/registry.js';
import { SubAgentSpawner } from '../agents/spawner.js';
import { GateManager } from '../gates/index.js';
import { GuardrailPipeline } from '../guardrails/index.js';
import { HarnessPipeline } from '../harness/index.js';
import { MediaProcessor, type MediaConfig } from '../media/media-processor.js';
import { TaskClassifier, type ClassifierContext } from '../router/classifier.js';
import { RouterEngine } from '../router/engine.js';
import { SkillMatcher } from '../skills/matcher.js';
import { SkillRegistry } from '../skills/registry.js';
import { logger } from '../utils/logger.js';
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
      savePartialTranscript: async () => {
        // Stub — Phase 2 (Déjà Vu) will implement real persistence
      },
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

  async handleMessage(message: InboundMessage): Promise<AgentResponse> {
    return this.queue.enqueue(message.sessionKey, async () => {
      try {
        return await this._executeLoop(message);
      } catch (err) {
        return this.recovery.handle(err, message);
      }
    });
  }

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

    // 3. Context assembly (stub — Phase 2)
    const systemPrompt = this.buildSystemPrompt(session, sanitized.content);

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
      return {
        content: output || 'Sub-agents completed but produced no output.',
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
    log.debug('Executing bridge', { model: route.selectedModel, maxTurns: route.maxTurns });
    const response = await this.bridge.run(sanitized.content, {
      cwd: this.config.workspacePath,
      model: route.selectedModel,
      permissionMode: this.config.permissionMode,
      allowedTools: route.allowedTools,
      systemPrompt,
      maxTurns: route.maxTurns,
    });
    log.debug('Bridge result', { success: response.success });

    // 7. Harness
    const validated = await this.harness.process(response, session);
    log.debug('Harness validated', { tokensUsed: validated.tokensUsed });

    // 8. Memory (stub — Phase 2)
    if (response.success) {
      this.sessions.updateTokens(session.id, validated.tokensUsed ?? 0);
    }

    // 9. Deliver
    log.debug('Pipeline complete', {
      model: route.selectedModel,
      tokensUsed: validated.tokensUsed,
    });
    return {
      content: validated.validatedContent ?? validated.content ?? '',
      model: route.selectedModel,
      tokensUsed: validated.tokensUsed,
    };
  }

  private buildSystemPrompt(session: any, query?: string): string {
    const base = `You are ${this.config.agentName}, a personal AI agent for ${this.config.userName}. Session: ${session.id}\n\nFormat your responses using markdown when appropriate: **bold** for emphasis, \`code\` for technical terms, code blocks for snippets, - for lists, and [text](url) for links. Keep formatting natural and readable — don't over-format simple replies.`;

    if (!query) return base;

    // Inject relevant skill contexts (Phase 6 — Kung Fu)
    const skillContexts = this.skillMatcher.getActiveContexts(query);
    if (skillContexts.length === 0) return base;

    return [base, '', '# Active Skills', '', ...skillContexts].join('\n');
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
