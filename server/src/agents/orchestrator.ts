/**
 * ░▒▓ ORCHESTRATOR ▓▒░
 *
 * "He is The One."
 *
 * Decides WHEN to spawn sub-agents and HOW to coordinate them.
 * Supports three orchestration patterns:
 *
 * | Pattern    | Behavior                                                  |
 * |------------|-----------------------------------------------------------|
 * | sequential | Agents run one-by-one, each building on previous output   |
 * | parallel   | All agents run simultaneously, results merged             |
 * | supervisor | Parallel execution, then a supervisor synthesizes results |
 */

import type {
  AgentConfig,
  AgentTeam,
  DecomposeDecision,
  InboundMessage,
  OrchestrationPattern,
  SubAgentResult,
  SubAgentTask,
} from '@neo-agent/shared';
import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { AgentRegistry } from './registry.js';
import type { SubAgentSpawner } from './spawner.js';

const DEFAULT_CONFIG: AgentConfig = {
  maxConcurrentAgents: 3,
  defaultSubAgentTimeout: 120_000,
  defaultSubAgentMaxTurns: 5,
  agentWorkspaceDir: '/tmp/neo-agents',
  autoDecompose: true,
  decompositionThreshold: 2,
  blueprintsDir: 'workspace/agents',
};

export class Orchestrator {
  private config: AgentConfig;

  constructor(
    private spawner: SubAgentSpawner,
    private registry: AgentRegistry,
    private db: Database.Database,
    config?: Partial<AgentConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze a message to determine if it should be decomposed into sub-agent tasks.
   */
  shouldDecompose(message: InboundMessage): DecomposeDecision {
    const content = message.content;
    const signals: Record<string, boolean> = {
      multiStep: /and then|after that|first.*then|step \d/i.test(content),
      research: /research|find out|compare|analyze multiple/i.test(content),
      parallel: /at the same time|simultaneously|in parallel|both/i.test(content),
      review: /review.*and.*fix|audit|check all/i.test(content),
      complex: content.length > 500,
    };

    const score = Object.values(signals).filter(Boolean).length;
    const suggestedPattern: OrchestrationPattern = signals.parallel ? 'parallel' : 'sequential';

    return {
      shouldDecompose: score >= this.config.decompositionThreshold,
      suggestedPattern,
      signals,
    };
  }

  /**
   * Execute an agent team using its configured orchestration pattern.
   */
  async executeTeam(team: AgentTeam): Promise<AgentTeam> {
    // Persist initial state
    this.persistTeam(team);

    // Update status to running
    team.status = 'running';
    this.updateTeamStatus(team.id, 'running');

    try {
      let results: SubAgentResult[];

      switch (team.pattern) {
        case 'parallel':
          results = await this.executeParallel(team.tasks);
          break;
        case 'supervisor':
          results = await this.executeSupervisor(team.tasks);
          break;
        case 'sequential':
        default:
          results = await this.executeSequential(team.tasks);
          break;
      }

      team.results = results;
      team.status = results.every((r) => r.success) ? 'completed' : 'failed';
      team.completedAt = Date.now();
    } catch {
      team.status = 'failed';
      team.completedAt = Date.now();
    }

    // Persist final state
    this.updateTeamFinal(team);
    return team;
  }

  /**
   * Create a new team object (does not execute).
   */
  createTeam(
    pattern: OrchestrationPattern,
    tasks: SubAgentTask[],
    parentSession?: string,
  ): AgentTeam {
    return {
      id: randomUUID(),
      pattern,
      tasks,
      status: 'pending',
      results: [],
      parentSession,
      createdAt: Date.now(),
    };
  }

  /**
   * Get a team by ID from the database.
   */
  getTeam(teamId: string): AgentTeam | undefined {
    const row = this.db.prepare('SELECT * FROM agent_teams WHERE id = ?').get(teamId) as
      | Record<string, unknown>
      | undefined;

    if (!row) return undefined;

    return {
      id: row.id as string,
      pattern: row.pattern as OrchestrationPattern,
      tasks: JSON.parse(row.agents as string) as SubAgentTask[],
      status: row.status as AgentTeam['status'],
      results: row.results ? (JSON.parse(row.results as string) as SubAgentResult[]) : [],
      parentSession: row.parent_session as string | undefined,
      createdAt: row.created_at as number,
      completedAt: row.completed_at as number | undefined,
    };
  }

  /**
   * List all teams.
   */
  listTeams(): AgentTeam[] {
    const rows = this.db
      .prepare('SELECT * FROM agent_teams ORDER BY created_at DESC')
      .all() as Record<string, unknown>[];

    return rows.map((row) => ({
      id: row.id as string,
      pattern: row.pattern as OrchestrationPattern,
      tasks: JSON.parse(row.agents as string) as SubAgentTask[],
      status: row.status as AgentTeam['status'],
      results: row.results ? (JSON.parse(row.results as string) as SubAgentResult[]) : [],
      parentSession: row.parent_session as string | undefined,
      createdAt: row.created_at as number,
      completedAt: row.completed_at as number | undefined,
    }));
  }

  // ── Pattern Implementations ──────────────────────────────────

  private async executeSequential(tasks: SubAgentTask[]): Promise<SubAgentResult[]> {
    const results: SubAgentResult[] = [];

    for (const task of tasks) {
      const blueprint = this.registry.get(task.blueprintName);
      if (!blueprint) {
        results.push({
          agentName: task.blueprintName,
          taskId: task.id,
          success: false,
          output: null,
          error: `Blueprint "${task.blueprintName}" not found`,
        });
        continue;
      }

      // Pass previous result as context
      if (results.length > 0) {
        const lastResult = results[results.length - 1];
        if (lastResult.success && lastResult.output) {
          const outputContent =
            typeof lastResult.output === 'string'
              ? lastResult.output
              : JSON.stringify(lastResult.output);
          task.context = (task.context ?? '') + '\n' + outputContent;
        }
      }

      const result = await this.spawner.spawn(blueprint, task);
      results.push(result);
    }

    return results;
  }

  private async executeParallel(tasks: SubAgentTask[]): Promise<SubAgentResult[]> {
    const concurrency = Math.min(tasks.length, this.config.maxConcurrentAgents);
    const results: SubAgentResult[] = [];

    // Process in batches of `concurrency`
    for (let i = 0; i < tasks.length; i += concurrency) {
      const batch = tasks.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((task) => {
          const blueprint = this.registry.get(task.blueprintName);
          if (!blueprint) {
            return Promise.resolve<SubAgentResult>({
              agentName: task.blueprintName,
              taskId: task.id,
              success: false,
              output: null,
              error: `Blueprint "${task.blueprintName}" not found`,
            });
          }
          return this.spawner.spawn(blueprint, task);
        }),
      );
      results.push(...batchResults);
    }

    return results;
  }

  private async executeSupervisor(tasks: SubAgentTask[]): Promise<SubAgentResult[]> {
    // Phase 1: parallel execution
    const workerResults = await this.executeParallel(tasks);

    // Phase 2: supervisor synthesis using planner blueprint
    const planner = this.registry.get('planner');
    if (!planner) return workerResults;

    const summaries = workerResults
      .map(
        (r) =>
          `[${r.agentName}] ${r.success ? 'SUCCESS' : 'FAILED'}: ${typeof r.output === 'string' ? r.output : JSON.stringify(r.output)}`,
      )
      .join('\n\n');

    const synthTask: SubAgentTask = {
      id: randomUUID(),
      blueprintName: 'planner',
      prompt: `Synthesize the following sub-agent results into a cohesive summary:\n\n${summaries}`,
    };

    const synthResult = await this.spawner.spawn(planner, synthTask);
    return [...workerResults, synthResult];
  }

  // ── Database Persistence ─────────────────────────────────────

  private persistTeam(team: AgentTeam) {
    this.db
      .prepare(
        'INSERT INTO agent_teams (id, pattern, agents, status, parent_session, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        team.id,
        team.pattern,
        JSON.stringify(team.tasks),
        team.status,
        team.parentSession ?? null,
        team.createdAt,
      );
  }

  private updateTeamStatus(teamId: string, status: string) {
    this.db.prepare('UPDATE agent_teams SET status = ? WHERE id = ?').run(status, teamId);
  }

  private updateTeamFinal(team: AgentTeam) {
    this.db
      .prepare('UPDATE agent_teams SET status = ?, results = ?, completed_at = ? WHERE id = ?')
      .run(team.status, JSON.stringify(team.results), team.completedAt ?? null, team.id);
  }
}
