/**
 * ░▒▓ SUB-AGENT SPAWNER ▓▒░
 *
 * "Tank, I need an exit."
 *
 * Creates isolated Claude sessions for sub-agents with their own
 * context window, working directory, and optional CLAUDE.md.
 */

import type {
  AgentBlueprint,
  ClaudeBridgeOptions,
  SubAgentResult,
  SubAgentTask,
} from '@neo-agent/shared';
import type { ClaudeBridge } from '../core/claude-bridge.js';
import { logger } from '../utils/logger.js';
import { AgentWorkspace, type IsolatedWorkspace } from './workspace.js';

const log = logger('spawner');

export class SubAgentSpawner {
  private workspace: AgentWorkspace;

  constructor(
    private bridge: ClaudeBridge,
    private agentWorkspaceDir: string,
  ) {
    this.workspace = new AgentWorkspace(agentWorkspaceDir);
  }

  async spawn(blueprint: AgentBlueprint, task: SubAgentTask): Promise<SubAgentResult> {
    const startTime = Date.now();
    let ws: IsolatedWorkspace | undefined;

    log.debug('Spawning sub-agent', {
      agent: blueprint.name,
      taskId: task.id,
      model: blueprint.model,
      maxTurns: blueprint.maxTurns,
      allowedTools: blueprint.allowedTools,
      promptLength: task.prompt.length,
    });

    try {
      // Create isolated workspace
      ws = this.workspace.create({
        taskId: task.id,
        agentName: blueprint.name,
        claudeMd: blueprint.claudeMd,
      });

      // Build the full prompt with task context
      const fullPrompt = task.context
        ? `${task.prompt}\n\n## Context from previous agent:\n${task.context}`
        : task.prompt;

      const opts: ClaudeBridgeOptions = {
        cwd: ws.baseDir,
        model: blueprint.model,
        allowedTools: blueprint.allowedTools,
        maxTurns: blueprint.maxTurns ?? 5,
        timeoutMs: blueprint.timeoutMs ?? 120_000,
        systemPrompt: blueprint.systemPrompt,
      };

      const result = await this.bridge.run(fullPrompt, opts);

      // Collect artifacts from workspace
      const artifacts = this.workspace.collectArtifacts(ws);

      const durationMs = Date.now() - startTime;
      log.debug('Sub-agent completed', {
        agent: blueprint.name,
        taskId: task.id,
        success: result.success,
        durationMs,
        artifactCount: artifacts?.length ?? 0,
        error: result.error ?? null,
      });

      return {
        agentName: blueprint.name,
        taskId: task.id,
        success: result.success,
        output: result.data,
        artifacts,
        tokensUsed: undefined, // SDK doesn't expose this directly in ClaudeResult
        durationMs,
        error: result.error,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      log.error('Sub-agent crashed', {
        agent: blueprint.name,
        taskId: task.id,
        durationMs,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        agentName: blueprint.name,
        taskId: task.id,
        success: false,
        output: null,
        durationMs,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      // Cleanup workspace after collecting artifacts
      if (ws) this.workspace.cleanup(ws);
    }
  }
}
