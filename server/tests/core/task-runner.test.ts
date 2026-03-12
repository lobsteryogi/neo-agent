/**
 * Tests for the TaskRunner service.
 *
 * Verifies that backlog tasks are picked up, moved through the pipeline,
 * and the correct agent activity events are broadcast.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskRunner } from '../../src/core/task-runner';
import type { KanbanTask } from '@neo-agent/shared';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../../src/core/claude-bridge', () => {
  const ClaudeBridge = vi.fn(() => ({
    on: vi.fn(),
    run: vi.fn().mockResolvedValue({
      success: true,
      data: { content: 'Research complete.' },
    }),
  }));
  return { ClaudeBridge };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<KanbanTask> = {}): KanbanTask {
  return {
    id: 'task-1',
    title: 'Research Bitcoin',
    description: 'Summarize the Bitcoin whitepaper',
    status: 'backlog',
    priority: 'medium',
    position: 1,
    labels: [],
    createdBy: 'user',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeTaskRepo(tasks: KanbanTask[] = []) {
  const movedTasks = new Map<string, KanbanTask>();
  return {
    list: vi.fn(() => tasks),
    update: vi.fn(),
    move: vi.fn((id: string, status: KanbanTask['status'], position: number) => {
      const task = tasks.find((t) => t.id === id) ?? movedTasks.get(id);
      if (!task) return undefined;
      const moved = { ...task, status, position, updatedAt: Date.now() };
      movedTasks.set(id, moved);
      return moved;
    }),
  };
}

/** Run start(), let one async cycle resolve, then stop immediately */
async function runOneCycle(runner: TaskRunner): Promise<void> {
  runner.start();
  // Flush the initial poll's microtasks (bridge.run promise resolves synchronously in mock)
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  runner.stop();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TaskRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts and stops without errors on empty backlog', async () => {
    const taskRepo = makeTaskRepo([]);
    const broadcast = vi.fn();
    const runner = new TaskRunner(taskRepo as any, broadcast);
    await runOneCycle(runner);
    expect(taskRepo.list).toHaveBeenCalledWith({ status: 'backlog' });
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('polls backlog on start immediately', async () => {
    const taskRepo = makeTaskRepo([]);
    const broadcast = vi.fn();
    const runner = new TaskRunner(taskRepo as any, broadcast);
    runner.start();
    expect(taskRepo.list).toHaveBeenCalledWith({ status: 'backlog' });
    runner.stop();
  });

  it('picks up a backlog task and broadcasts agent:assigned', async () => {
    const task = makeTask();
    const taskRepo = makeTaskRepo([task]);
    const broadcast = vi.fn();
    const runner = new TaskRunner(taskRepo as any, broadcast, { pollIntervalMs: 60000 });

    await runOneCycle(runner);

    const assignedEvent = broadcast.mock.calls.find((c) => c[0].type === 'agent:assigned');
    expect(assignedEvent).toBeDefined();
    expect(assignedEvent![0].taskId).toBe('task-1');
    expect(assignedEvent![0].agentName).toBe('neo-runner');
  });

  it('moves task to in_progress then to review on success', async () => {
    const task = makeTask();
    const taskRepo = makeTaskRepo([task]);
    const broadcast = vi.fn();
    const runner = new TaskRunner(taskRepo as any, broadcast, { pollIntervalMs: 60000 });

    await runOneCycle(runner);

    expect(taskRepo.move).toHaveBeenCalledWith('task-1', 'in_progress', 1);
    expect(taskRepo.move).toHaveBeenCalledWith('task-1', 'review', 1);
  });

  it('broadcasts agent:completed with message on success', async () => {
    const task = makeTask();
    const taskRepo = makeTaskRepo([task]);
    const broadcast = vi.fn();
    const runner = new TaskRunner(taskRepo as any, broadcast, { pollIntervalMs: 60000 });

    await runOneCycle(runner);

    const completedEvent = broadcast.mock.calls.find((c) => c[0].type === 'agent:completed');
    expect(completedEvent).toBeDefined();
    expect(completedEvent![0].taskId).toBe('task-1');
    expect(completedEvent![0].message).toContain('Research complete');
  });

  it('moves to error and broadcasts agent:failed on bridge failure', async () => {
    const { ClaudeBridge } = await import('../../src/core/claude-bridge');
    vi.mocked(ClaudeBridge).mockImplementationOnce(
      () =>
        ({
          on: vi.fn(),
          run: vi
            .fn()
            .mockResolvedValue({ success: false, error: 'TIMEOUT', message: 'timed out' }),
        }) as any,
    );

    const task = makeTask();
    const taskRepo = makeTaskRepo([task]);
    const broadcast = vi.fn();
    const runner = new TaskRunner(taskRepo as any, broadcast, { pollIntervalMs: 60000 });

    await runOneCycle(runner);

    expect(taskRepo.move).toHaveBeenCalledWith('task-1', 'error', 1);

    const failedEvent = broadcast.mock.calls.find((c) => c[0].type === 'agent:failed');
    expect(failedEvent).toBeDefined();
    expect(failedEvent![0].error).toBe('TIMEOUT');
  });

  it('broadcasts task:moved events alongside agent events', async () => {
    const task = makeTask();
    const taskRepo = makeTaskRepo([task]);
    const broadcast = vi.fn();
    const runner = new TaskRunner(taskRepo as any, broadcast, { pollIntervalMs: 60000 });

    await runOneCycle(runner);

    const movedEvents = broadcast.mock.calls.filter((c) => c[0].type === 'task:moved');
    // Should have two: backlog→in_progress and in_progress→review
    expect(movedEvents.length).toBeGreaterThanOrEqual(2);
  });

  it('does not run if running.size >= maxConcurrent', async () => {
    const tasks = [makeTask({ id: 'a' }), makeTask({ id: 'b' })];
    const taskRepo = makeTaskRepo(tasks);
    const broadcast = vi.fn();

    const { ClaudeBridge } = await import('../../src/core/claude-bridge');
    // Never resolves — simulates stuck task
    vi.mocked(ClaudeBridge).mockImplementation(
      () =>
        ({
          on: vi.fn(),
          run: vi.fn().mockReturnValue(new Promise(() => {})),
        }) as any,
    );

    const runner = new TaskRunner(taskRepo as any, broadcast, {
      pollIntervalMs: 60000,
      maxConcurrent: 1,
    });

    runner.start();
    // After initial poll, task 'a' is running but 'b' is blocked by maxConcurrent=1
    await Promise.resolve();

    // Only one task should have been moved to in_progress
    const inProgressCalls = taskRepo.move.mock.calls.filter((c) => c[1] === 'in_progress');
    expect(inProgressCalls).toHaveLength(1);

    runner.stop();
  });
});
