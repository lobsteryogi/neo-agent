/**
 * ░▒▓ CLAUDE BRIDGE ▓▒░
 *
 * "I can see the code now..."
 *
 * Wraps @anthropic-ai/claude-agent-sdk query() API.
 * Streams messages via EventEmitter, enforces AbortController timeout.
 */

import type { ClaudeBridgeOptions, ClaudeResult, SDKStreamMessage } from '@neo-agent/shared';
import { EventEmitter } from 'events';
import { getErrorMessage } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const log = logger('bridge');

export class ClaudeBridge extends EventEmitter {
  async run(prompt: string, opts: ClaudeBridgeOptions): Promise<ClaudeResult> {
    const controller = new AbortController();
    const timeoutMs = opts.timeoutMs ?? 600_000;

    log.debug('Bridge.run start', {
      model: opts.model,
      maxTurns: opts.maxTurns ?? 10,
      timeoutMs,
      cwd: opts.cwd,
      permissionMode: opts.permissionMode,
      allowedTools: opts.allowedTools,
      resumeSessionId: opts.resumeSessionId ?? null,
      promptLength: prompt.length,
    });

    // Deadline: hard timeout
    const timeout = setTimeout(() => {
      log.warn('Timeout triggered', { timeoutMs });
      controller.abort();
    }, timeoutMs);

    try {
      // Dynamic import to avoid issues if SDK isn't installed
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      const queryOpts = {
        prompt,
        options: {
          cwd: opts.cwd,
          model: opts.model,
          maxTurns: opts.maxTurns ?? 10,
          abortController: controller,
          systemPrompt: opts.systemPrompt,
          allowedTools: opts.allowedTools,
          permissionMode: opts.permissionMode,
          allowDangerouslySkipPermissions: opts.allowDangerouslySkipPermissions,
        } as Record<string, unknown>,
      };

      // Support session resume — SDK expects resume = sessionId string
      if (opts.resumeSessionId) {
        queryOpts.options.resume = opts.resumeSessionId;
      }

      log.debug('SDK query issued');
      const conversation = query(queryOpts as Parameters<typeof query>[0]);

      let resultContent = '';
      const messages: SDKStreamMessage[] = [];
      let turnCount = 0;
      let toolCallCount = 0;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalCostUsd = 0;

      // Create an abort promise that rejects when the controller fires
      const abortPromise = new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(new Error('ABORT_SIGNAL')), {
          once: true,
        });
      });

      // Race the iteration against the abort signal
      const iterate = async () => {
        for await (const message of conversation) {
          messages.push(message);

          this.emit('stream', message);
          this.emit('token-estimate', message);

          // Log every message type for full visibility
          if (message.type === 'system') {
            log.debug('SDK system message', {
              sessionId: (message as any).session_id ?? null,
              subtype: (message as any).subtype ?? null,
            });
          }

          if (message.type === 'assistant') {
            turnCount++;
            const content = (message as SDKStreamMessage).message?.content;
            const model = (message as SDKStreamMessage).message?.model;
            if (model) log.debug('Assistant turn', { turn: turnCount, model });

            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'text' && block.text) {
                  resultContent += block.text;
                  log.debug('Text block', { length: block.text.length, turn: turnCount });
                }
                if (block.type === 'tool_use' && block.name) {
                  toolCallCount++;
                  const input = block.input as Record<string, unknown> | undefined;
                  const target =
                    (input?.file_path as string) ??
                    (input?.pattern as string) ??
                    (input?.query as string) ??
                    (input?.url as string) ??
                    (input?.skill as string) ??
                    (input?.description as string)?.slice(0, 60) ??
                    (input?.command as string)?.slice(0, 80) ??
                    undefined;
                  log.debug('Tool call', {
                    tool: block.name,
                    toolCallNum: toolCallCount,
                    ...(target ? { target } : {}),
                    ...(block.id ? { toolUseId: block.id } : {}),
                  });
                }
              }
            }
          }

          if ((message as any).type === 'tool_result') {
            const msg = message as any;
            log.debug('Tool result', {
              toolUseId: msg.tool_use_id ?? msg.id ?? null,
              isError: msg.is_error ?? false,
              contentLength: typeof msg.content === 'string' ? msg.content.length : null,
            });
          }

          if (message.type === 'result') {
            resultContent = (message as SDKStreamMessage).result ?? resultContent;
            const usage = (message as SDKStreamMessage).modelUsage;
            const usageSummary: Record<string, unknown> = {};
            if (usage) {
              for (const [model, u] of Object.entries(usage) as [string, any][]) {
                const input = u.inputTokens ?? u.input_tokens ?? 0;
                const output = u.outputTokens ?? u.output_tokens ?? 0;
                const cost = u.costUSD ?? 0;
                totalInputTokens += input;
                totalOutputTokens += output;
                totalCostUsd += cost;
                usageSummary[model] = { input, output, cost };
              }
            }
            log.debug('Result received', {
              contentLength: resultContent.length,
              turns: turnCount,
              toolCalls: toolCallCount,
              totalMessages: messages.length,
              usage: usageSummary,
            });
          }

          // Capture session ID
          if ((message as any).session_id) {
            log.debug('Session ID captured', { sdkSessionId: (message as any).session_id });
          }
        }
      };

      await Promise.race([iterate(), abortPromise]);

      log.debug('Bridge.run success', {
        turns: turnCount,
        toolCalls: toolCallCount,
        responseLength: resultContent.length,
        totalMessages: messages.length,
      });

      return {
        success: true,
        data: {
          content: resultContent,
          messages,
          model: opts.model,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          costUsd: totalCostUsd,
        },
      };
    } catch (err: unknown) {
      const errMsg = getErrorMessage(err);
      if (controller.signal.aborted || errMsg === 'ABORT_SIGNAL') {
        log.warn('Bridge.run timeout', { timeoutMs, error: errMsg });
        return {
          success: false,
          error: 'TIMEOUT',
          message: 'The Deadline was reached. Time ran out.',
        };
      }
      log.error('Bridge.run crash', { error: errMsg, stack: (err as Error)?.stack?.slice(0, 500) });
      return {
        success: false,
        error: 'CRASH',
        message: errMsg,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
