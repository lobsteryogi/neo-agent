import type { AgentBlueprint, SubAgentTask } from '@neo-agent/shared';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubAgentSpawner } from '../../src/agents/spawner';
import { ClaudeBridge } from '../../src/core/claude-bridge';

// Mock the SDK so bridge.run() doesn't hit real Claude
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

const TEMP_DIR = join(__dirname, '__tmp_spawner__');

function makeBlueprint(overrides?: Partial<AgentBlueprint>): AgentBlueprint {
  return {
    name: 'test-agent',
    description: 'A test agent',
    systemPrompt: 'You are a test agent.',
    model: 'sonnet',
    maxTurns: 3,
    timeoutMs: 5_000,
    ...overrides,
  };
}

function makeTask(overrides?: Partial<SubAgentTask>): SubAgentTask {
  return {
    id: 'task-1',
    blueprintName: 'test-agent',
    prompt: 'Do something useful',
    ...overrides,
  };
}

describe('SubAgentSpawner', () => {
  let spawner: SubAgentSpawner;
  let bridge: ClaudeBridge;

  beforeEach(async () => {
    bridge = new ClaudeBridge();
    spawner = new SubAgentSpawner(bridge, TEMP_DIR);

    // Default: mock bridge.run to return success
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    vi.mocked(query).mockImplementation(() => {
      const generator = (async function* () {
        yield {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Task completed successfully.' }] },
        };
      })();
      return generator as any;
    });
  });

  afterEach(() => {
    if (existsSync(TEMP_DIR)) {
      rmSync(TEMP_DIR, { recursive: true, force: true });
    }
  });

  it('spawns an agent and returns a successful result', async () => {
    const result = await spawner.spawn(makeBlueprint(), makeTask());

    expect(result.success).toBe(true);
    expect(result.agentName).toBe('test-agent');
    expect(result.taskId).toBe('task-1');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });

  it('cleans up workspace after spawn', async () => {
    const taskId = 'cleanup-test';
    await spawner.spawn(makeBlueprint(), makeTask({ id: taskId }));

    const wsDir = join(TEMP_DIR, 'agents', taskId);
    expect(existsSync(wsDir)).toBe(false);
  });

  it('includes task context in prompt when provided', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    let capturedPrompt = '';

    vi.mocked(query).mockImplementation((opts: any) => {
      capturedPrompt = opts.prompt;
      const generator = (async function* () {
        yield {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Done.' }] },
        };
      })();
      return generator as any;
    });

    await spawner.spawn(
      makeBlueprint(),
      makeTask({ prompt: 'Write code', context: 'Previous agent found X' }),
    );

    expect(capturedPrompt).toContain('Write code');
    expect(capturedPrompt).toContain('Previous agent found X');
    expect(capturedPrompt).toContain('Context from previous agent');
  });

  it('passes blueprint config to bridge', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    let capturedOpts: any = {};

    vi.mocked(query).mockImplementation((opts: any) => {
      capturedOpts = opts;
      const generator = (async function* () {
        yield {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Done.' }] },
        };
      })();
      return generator as any;
    });

    await spawner.spawn(
      makeBlueprint({
        model: 'opus',
        maxTurns: 8,
        allowedTools: ['Read', 'Write', 'Bash'],
        systemPrompt: 'You are a coder.',
      }),
      makeTask(),
    );

    expect(capturedOpts.options?.model).toBe('opus');
    expect(capturedOpts.options?.maxTurns).toBe(8);
    expect(capturedOpts.options?.systemPrompt).toBe('You are a coder.');
  });

  it('returns failure result when bridge crashes', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');

    vi.mocked(query).mockImplementation(() => {
      const generator = (async function* () {
        throw new Error('SDK exploded');
      })();
      return generator as any;
    });

    const result = await spawner.spawn(makeBlueprint(), makeTask());

    expect(result.success).toBe(false);
    expect(result.error).toContain('SDK exploded');
    expect(result.agentName).toBe('test-agent');
  });

  it('returns failure result when bridge times out', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');

    vi.mocked(query).mockImplementation(() => {
      const generator = (async function* () {
        await new Promise(() => {}); // hang forever
      })();
      return generator as any;
    });

    const result = await spawner.spawn(
      makeBlueprint({ timeoutMs: 200 }),
      makeTask({ id: 'timeout-task' }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('TIMEOUT');
  }, 10_000);

  it('cleans up workspace even on failure', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');

    vi.mocked(query).mockImplementation(() => {
      const generator = (async function* () {
        throw new Error('boom');
      })();
      return generator as any;
    });

    const taskId = 'fail-cleanup';
    await spawner.spawn(makeBlueprint(), makeTask({ id: taskId }));

    const wsDir = join(TEMP_DIR, 'agents', taskId);
    expect(existsSync(wsDir)).toBe(false);
  });
});
