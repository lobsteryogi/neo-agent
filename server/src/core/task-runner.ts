/**
 * ░▒▓ TASK RUNNER ▓▒░
 *
 * "There is no spoon."
 *
 * Automatically picks up backlog tasks, routes them through the agent
 * pipeline, and broadcasts real-time progress events to the dashboard.
 */

import type { KanbanTask, SDKStreamMessage } from '@neo-agent/shared';
import { ClaudeBridge } from './claude-bridge.js';
import type { TaskRepo } from '../db/task-repo.js';
import { getErrorMessage } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { fireWebhook } from '../utils/webhooks.js';

const log = logger('task-runner');

export type BroadcastFn = (event: { type: string; [key: string]: unknown }) => void;

export class TaskRunner {
  private running = new Set<string>(); // taskIds currently being processed
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private taskRepo: TaskRepo,
    private broadcast: BroadcastFn,
    private config: {
      pollIntervalMs?: number;
      maxConcurrent?: number;
      workspaceDir?: string;
      model?: string;
    } = {},
  ) {}

  start(): void {
    const intervalMs = this.config.pollIntervalMs ?? 5000;
    this.poll(); // Run immediately on start
    this.interval = setInterval(() => this.poll(), intervalMs);
    log.debug('TaskRunner started', { intervalMs, maxConcurrent: this.config.maxConcurrent ?? 2 });
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    log.debug('TaskRunner stopped');
  }

  private poll(): void {
    const maxConcurrent = this.config.maxConcurrent ?? 2;
    if (this.running.size >= maxConcurrent) return;

    try {
      // Backlog first, then review (review = AI self-review before done)
      const backlogTasks = this.taskRepo.list({ status: 'backlog' });
      const reviewTasks = this.taskRepo.list({ status: 'review' });
      const available = [
        ...backlogTasks.filter((t) => !this.running.has(t.id)),
        ...reviewTasks.filter((t) => !this.running.has(t.id)),
      ];

      for (const task of available) {
        if (this.running.size >= maxConcurrent) break;
        const run = task.status === 'review' ? this.reviewTask(task) : this.runTask(task);
        run.catch((err) => {
          log.error('task unhandled error', { taskId: task.id, error: getErrorMessage(err) });
        });
      }
    } catch (err) {
      log.error('Poll error', { error: getErrorMessage(err) });
    }
  }

  private async runTask(task: KanbanTask): Promise<void> {
    this.running.add(task.id);
    const agentName = 'neo-runner';
    const startTime = Date.now();
    log.debug('Picking up task', { taskId: task.id, title: task.title });

    try {
      // Move to in_progress and notify dashboard
      const inProgress = this.taskRepo.move(task.id, 'in_progress', task.position);
      if (inProgress) {
        this.broadcast({ type: 'task:moved', task: inProgress });
      }

      // Announce assignment
      this.broadcast({
        type: 'agent:assigned',
        taskId: task.id,
        agentName,
        timestamp: Date.now(),
        message: `Assigned to: "${task.title}"`,
      });

      // Create a dedicated bridge for this task so stream events are isolated
      const bridge = new ClaudeBridge();
      let lastProgressAt = 0;

      bridge.on('stream', (msg: SDKStreamMessage) => {
        const now = Date.now();
        // Throttle broadcasts to one per 1.5 seconds
        if (now - lastProgressAt < 1500) return;

        let progressMsg: string | null = null;
        let eventKind: 'text' | 'tool_use' | 'system' = 'text';
        let toolName: string | undefined;

        if (msg.type === 'assistant') {
          const content = msg.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'tool_use' && block.name) {
                const input = block.input as Record<string, unknown> | undefined;
                const target =
                  (input?.file_path as string) ??
                  (input?.pattern as string) ??
                  (input?.query as string) ??
                  (input?.url as string) ??
                  undefined;
                progressMsg = target ? `${String(target).slice(0, 60)}` : String(block.name);
                eventKind = 'tool_use';
                toolName = String(block.name);
                break;
              }
              if (block.type === 'text' && block.text) {
                const text = String(block.text).trim();
                if (text.length > 0) {
                  progressMsg = text.slice(0, 100) + (text.length > 100 ? '...' : '');
                  eventKind = 'text';
                }
                break;
              }
            }
          }
        }

        if (progressMsg) {
          lastProgressAt = now;
          this.broadcast({
            type: 'agent:progress',
            taskId: task.id,
            agentName,
            timestamp: now,
            message: progressMsg,
            eventKind,
            toolName,
          });
        }
      });

      // Initial "starting" event
      this.broadcast({
        type: 'agent:progress',
        taskId: task.id,
        agentName,
        timestamp: Date.now(),
        message: 'Starting work...',
      });

      const prompt = task.description?.trim()
        ? `Task: ${task.title}\n\n${task.description}`
        : `Task: ${task.title}`;

      const cwd = this.config.workspaceDir ?? process.cwd();
      const result = await bridge.run(prompt, {
        cwd,
        model: (task.model ?? this.config.model ?? 'sonnet') as 'sonnet' | 'opus' | 'haiku',
        maxTurns: 20,
        timeoutMs: 300_000,
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
        permissionMode: 'dontAsk',
      });

      const durationMs = Date.now() - startTime;

      if (result.success) {
        const data = result.data as Record<string, unknown> | undefined;
        const content = (data?.content as string) ?? 'Task completed.';

        // Persist result to DB (survives page refresh)
        this.taskRepo.update(task.id, { agentResult: content.slice(0, 4000) });

        // Move to review, then immediately kick off AI review (no poll delay)
        const reviewed = this.taskRepo.move(task.id, 'review', task.position);
        if (reviewed) {
          this.broadcast({
            type: 'task:moved',
            task: { ...reviewed, agentResult: content.slice(0, 4000) },
          });
          // Schedule review after current call stack so running.delete(task.id) fires first
          const taskForReview = { ...reviewed, agentResult: content.slice(0, 4000) };
          setImmediate(() => {
            if (!this.running.has(taskForReview.id)) {
              this.reviewTask(taskForReview).catch((err) => {
                log.error('reviewTask unhandled error', {
                  taskId: taskForReview.id,
                  error: getErrorMessage(err),
                });
              });
            }
          });
        }

        this.broadcast({
          type: 'agent:completed',
          taskId: task.id,
          agentName,
          timestamp: Date.now(),
          durationMs,
          message: content.slice(0, 1000),
        });

        log.debug('Task completed', { taskId: task.id, durationMs });
      } else {
        // Failed — move to error lane
        const errored = this.taskRepo.move(task.id, 'error', task.position);
        if (errored) {
          this.broadcast({ type: 'task:moved', task: errored });
        }

        this.broadcast({
          type: 'agent:failed',
          taskId: task.id,
          agentName,
          timestamp: Date.now(),
          durationMs,
          error: result.error ?? 'UNKNOWN',
          message: result.message ?? result.error ?? 'Task failed',
        });

        log.warn('Task failed', { taskId: task.id, error: result.error, durationMs });
      }
    } catch (err) {
      const errMsg = getErrorMessage(err);
      const durationMs = Date.now() - startTime;

      try {
        const errored = this.taskRepo.move(task.id, 'error', task.position);
        if (errored) {
          this.broadcast({ type: 'task:moved', task: errored });
        }
      } catch {
        // Ignore move errors
      }

      this.broadcast({
        type: 'agent:failed',
        taskId: task.id,
        agentName,
        timestamp: Date.now(),
        durationMs,
        error: errMsg,
        message: errMsg,
      });

      log.error('Task crashed', { taskId: task.id, error: errMsg, durationMs });
    } finally {
      this.running.delete(task.id);
    }
  }

  /**
   * Review lane: AI re-evaluates the previous result, corrects any errors,
   * then finalises by moving to done automatically.
   */
  private async reviewTask(task: KanbanTask): Promise<void> {
    this.running.add(task.id);
    const agentName = 'neo-reviewer';
    const startTime = Date.now();
    log.debug('Reviewing task', { taskId: task.id, title: task.title });

    try {
      // Move back to in_progress while reviewing
      const inProgress = this.taskRepo.move(task.id, 'in_progress', task.position);
      if (inProgress) {
        this.broadcast({ type: 'task:moved', task: inProgress });
      }

      this.broadcast({
        type: 'agent:assigned',
        taskId: task.id,
        agentName,
        timestamp: Date.now(),
        message: `Reviewing: "${task.title}"`,
      });

      const bridge = new ClaudeBridge();
      let lastProgressAt = 0;

      bridge.on('stream', (msg: SDKStreamMessage) => {
        const now = Date.now();
        if (now - lastProgressAt < 1500) return;
        let progressMsg: string | null = null;
        if (msg.type === 'assistant') {
          const content = msg.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'tool_use' && block.name) {
                const input = block.input as Record<string, unknown> | undefined;
                const target =
                  (input?.file_path as string) ??
                  (input?.pattern as string) ??
                  (input?.query as string) ??
                  (input?.url as string) ??
                  undefined;
                progressMsg = target
                  ? `${block.name}: ${String(target).slice(0, 60)}`
                  : `Tool: ${block.name}`;
                break;
              }
              if (block.type === 'text' && block.text) {
                const text = String(block.text).trim();
                if (text.length > 0) {
                  progressMsg = text.slice(0, 100) + (text.length > 100 ? '...' : '');
                }
                break;
              }
            }
          }
        }
        if (progressMsg) {
          lastProgressAt = now;
          this.broadcast({
            type: 'agent:progress',
            taskId: task.id,
            agentName,
            timestamp: now,
            message: progressMsg,
          });
        }
      });

      this.broadcast({
        type: 'agent:progress',
        taskId: task.id,
        agentName,
        timestamp: Date.now(),
        message: 'Reviewing result for correctness...',
      });

      const previousResult = task.agentResult?.trim() ?? '(no result recorded)';
      const reviewPrompt = [
        `You are reviewing the output of a completed task. Your job:`,
        `1. Verify the result is correct, complete, and fully addresses the task`,
        `2. Fix any errors, inaccuracies, or missing parts using available tools`,
        `3. Produce the final, polished result`,
        ``,
        `Task: ${task.title}`,
        task.description ? `Description: ${task.description}` : '',
        ``,
        `Previous result:`,
        previousResult,
        ``,
        `Review the above. If it is correct and complete, confirm it with a brief summary.`,
        `If there are issues, research and fix them, then provide the corrected result.`,
      ]
        .filter(Boolean)
        .join('\n');

      const cwd = this.config.workspaceDir ?? process.cwd();
      const result = await bridge.run(reviewPrompt, {
        cwd,
        model: (task.model ?? this.config.model ?? 'sonnet') as 'sonnet' | 'opus' | 'haiku',
        maxTurns: 20,
        timeoutMs: 300_000,
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
        permissionMode: 'dontAsk',
      });

      const durationMs = Date.now() - startTime;

      if (result.success) {
        const data = result.data as Record<string, unknown> | undefined;
        const content = (data?.content as string) ?? previousResult;

        this.taskRepo.update(task.id, { agentResult: content.slice(0, 4000) });

        const done = this.taskRepo.move(task.id, 'done', task.position);
        if (done) {
          this.broadcast({
            type: 'task:moved',
            task: { ...done, agentResult: content.slice(0, 4000) },
          });
        }

        this.broadcast({
          type: 'agent:completed',
          taskId: task.id,
          agentName,
          timestamp: Date.now(),
          durationMs,
          message: content.slice(0, 1000),
        });

        if (done) fireWebhook('task:done', { task: done });
        log.debug('Review completed → done', { taskId: task.id, durationMs });
      } else {
        // Review failed — move to error lane
        const errored = this.taskRepo.move(task.id, 'error', task.position);
        if (errored) {
          this.broadcast({ type: 'task:moved', task: errored });
        }

        this.broadcast({
          type: 'agent:failed',
          taskId: task.id,
          agentName,
          timestamp: Date.now(),
          durationMs,
          error: result.error ?? 'UNKNOWN',
          message: result.message ?? result.error ?? 'Review failed',
        });

        log.warn('Review failed', { taskId: task.id, error: result.error, durationMs });
      }
    } catch (err) {
      const errMsg = getErrorMessage(err);
      const durationMs = Date.now() - startTime;

      try {
        const errored = this.taskRepo.move(task.id, 'error', task.position);
        if (errored) {
          this.broadcast({ type: 'task:moved', task: errored });
        }
      } catch {
        // Ignore move errors
      }

      this.broadcast({
        type: 'agent:failed',
        taskId: task.id,
        agentName,
        timestamp: Date.now(),
        durationMs,
        error: errMsg,
        message: errMsg,
      });

      log.error('Review crashed', { taskId: task.id, error: errMsg, durationMs });
    } finally {
      this.running.delete(task.id);
    }
  }
}
