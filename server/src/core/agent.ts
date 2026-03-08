/**
 * ░▒▓ NEO AGENT ▓▒░
 *
 * "I know why you're here, Neo. I know what you've been doing."
 *
 * The main orchestrator — 9-step pipeline:
 * guardrails → session → context → route → gate → execute → harness → memory → deliver
 *
 * Memory and Router are stubbed for Phase 1 (built in Phase 2 & 3).
 */

import type { AgentResponse, InboundMessage, NeoConfig } from '@neo-agent/shared';
import type Database from 'better-sqlite3';
import { join } from 'path';
import { GateManager } from '../gates/index.js';
import { GuardrailPipeline } from '../guardrails/index.js';
import { HarnessPipeline } from '../harness/index.js';
import { TaskClassifier, type ClassifierContext } from '../router/classifier.js';
import { RouterEngine } from '../router/engine.js';
import { SkillMatcher } from '../skills/matcher.js';
import { SkillRegistry } from '../skills/registry.js';
import { ClaudeBridge } from './claude-bridge.js';
import { ErrorRecovery } from './error-recovery.js';
import { SessionQueue } from './session-queue.js';
import { SessionManager } from './session.js';

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
    // 1. Guardrails
    const sanitized = await this.guardrails.process(message);

    // 2. Session
    const session = this.sessions.resolveOrCreate(
      message.channelId,
      message.userId,
      message.channel,
    );

    // 3. Context assembly (stub — Phase 2)
    const systemPrompt = this.buildSystemPrompt(session, sanitized.content);

    // 4. Route — classify then select optimal model tier (Phase 3)
    const context: ClassifierContext = {
      tokenCount: session.totalTokens ?? 0,
      hasActiveTools: false,
    };
    const classification = this.classifier.classify(sanitized.content, context);
    const route = this.router.selectModel(classification, this.config.routingProfile);

    // 5. Gate check (PRE-EXECUTION scope)
    const gateResult = await this.gates.check(sanitized, {
      ...route,
      requiresExecution: this.looksLikeExecution(sanitized.content),
    });

    if (gateResult.blocked) {
      this.harness.historian.logGateBlock(session.id, gateResult);
      return {
        content: gateResult.neoQuip ?? gateResult.reason ?? 'Blocked by gate.',
        model: route.selectedModel,
        gateBlocked: gateResult,
      };
    }

    // 6. Execute via Claude Bridge
    const response = await this.bridge.run(sanitized.content, {
      cwd: this.config.workspacePath,
      model: route.selectedModel,
      permissionMode: this.config.permissionMode,
      allowedTools: route.allowedTools,
      systemPrompt,
      maxTurns: route.maxTurns,
    });

    // 7. Harness
    const validated = await this.harness.process(response, session);

    // 8. Memory (stub — Phase 2)
    if (response.success) {
      this.sessions.updateTokens(session.id, validated.tokensUsed ?? 0);
    }

    // 9. Deliver
    return {
      content: validated.validatedContent ?? validated.content ?? '',
      model: route.selectedModel,
      tokensUsed: validated.tokensUsed,
    };
  }

  private buildSystemPrompt(session: any, query?: string): string {
    const base = `You are ${this.config.agentName}, a personal AI agent for ${this.config.userName}. Session: ${session.id}`;

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
