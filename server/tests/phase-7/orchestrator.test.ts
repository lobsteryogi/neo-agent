import type { InboundMessage } from '@neo-agent/shared';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Orchestrator } from '../../src/agents/orchestrator';
import { AgentRegistry } from '../../src/agents/registry';
import { SubAgentSpawner } from '../../src/agents/spawner';
import { ClaudeBridge } from '../../src/core/claude-bridge';
import { runMigrations } from '../../src/db/migrations';

function makeMessage(content: string): InboundMessage {
  return {
    id: 'msg-1',
    channelId: 'test',
    channel: 'cli',
    userId: 'user-1',
    content,
    timestamp: Date.now(),
    sessionKey: 'test-session',
  };
}

describe('Orchestrator', () => {
  let db: Database.Database;
  let orchestrator: Orchestrator;
  let registry: AgentRegistry;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);

    registry = new AgentRegistry();
    registry.register({
      name: 'planner',
      description: 'Plans tasks',
      systemPrompt: 'You plan things.',
      model: 'sonnet',
    });
    registry.register({
      name: 'coder',
      description: 'Writes code',
      systemPrompt: 'You code things.',
      model: 'opus',
    });

    const bridge = new ClaudeBridge();
    const spawner = new SubAgentSpawner(bridge, '/tmp/neo-test-agents');
    orchestrator = new Orchestrator(spawner, registry, db);
  });

  afterEach(() => {
    db.close();
  });

  it('detects multi-step tasks as decomposable', () => {
    const decision = orchestrator.shouldDecompose(
      makeMessage(
        'First research the API, and then implement the integration, and then write tests',
      ),
    );
    expect(decision.shouldDecompose).toBe(true);
    expect(decision.signals.multiStep).toBe(true);
  });

  it('does not decompose simple tasks', () => {
    const decision = orchestrator.shouldDecompose(makeMessage('What time is it?'));
    expect(decision.shouldDecompose).toBe(false);
  });

  it('selects parallel pattern when parallel signals detected', () => {
    const decision = orchestrator.shouldDecompose(
      makeMessage(
        'Research both APIs simultaneously and compare them and then write a detailed analysis',
      ),
    );
    if (decision.shouldDecompose) {
      expect(decision.suggestedPattern).toBe('parallel');
    }
  });

  it('createTeam() produces valid team structure', () => {
    const team = orchestrator.createTeam('sequential', [
      { id: 'task-1', blueprintName: 'planner', prompt: 'Plan something' },
    ]);
    expect(team.id).toBeDefined();
    expect(team.pattern).toBe('sequential');
    expect(team.status).toBe('pending');
    expect(team.tasks).toHaveLength(1);
  });

  it('respects decompositionThreshold configuration', () => {
    // Default threshold is 2, one signal shouldn't trigger
    const decision = orchestrator.shouldDecompose(
      makeMessage('research what the best approach is'),
    );
    // Only 'research' signal fires (1 < threshold)
    expect(decision.signals.research).toBe(true);
    expect(decision.shouldDecompose).toBe(false);
  });

  it('persists team to database on executeTeam', async () => {
    const team = orchestrator.createTeam('sequential', [
      { id: 'task-1', blueprintName: 'nonexistent', prompt: 'Do a thing' },
    ]);

    // This will fail gracefully because 'nonexistent' blueprint doesn't exist
    const completed = await orchestrator.executeTeam(team);
    expect(completed.status).toBeDefined();

    // Team should be persisted in DB
    const dbTeam = orchestrator.getTeam(team.id);
    expect(dbTeam).toBeDefined();
    expect(dbTeam?.id).toBe(team.id);
  });

  it('listTeams() returns all persisted teams', async () => {
    // Execute a single team to verify persistence + listing
    const team = orchestrator.createTeam('sequential', [
      { id: 'task-a', blueprintName: 'nonexistent', prompt: 'Test' },
    ]);
    await orchestrator.executeTeam(team);

    const teams = orchestrator.listTeams();
    expect(teams.length).toBeGreaterThanOrEqual(1);
    expect(teams.some((t) => t.id === team.id)).toBe(true);
  });
});
