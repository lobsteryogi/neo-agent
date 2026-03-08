/**
 * ░▒▓ CLAUDE BRIDGE ▓▒░
 *
 * "I can see the code now..."
 *
 * Wraps @anthropic-ai/claude-agent-sdk query() API.
 * Streams messages via EventEmitter, enforces AbortController timeout.
 */

import type { ClaudeBridgeOptions, ClaudeResult } from '@neo-agent/shared';
import { EventEmitter } from 'events';

export class ClaudeBridge extends EventEmitter {
  async run(prompt: string, opts: ClaudeBridgeOptions): Promise<ClaudeResult> {
    const controller = new AbortController();

    // Deadline: hard timeout
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 600_000);

    try {
      // Dynamic import to avoid issues if SDK isn't installed
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      const queryOpts: any = {
        prompt,
        options: {
          cwd: opts.cwd,
          maxTurns: opts.maxTurns ?? 10,
          abortController: controller,
          systemPrompt: opts.systemPrompt,
          allowedTools: opts.allowedTools,
        },
      };

      // Support session resume
      if ((opts as any).sessionId) {
        queryOpts.options.resume = true;
        queryOpts.options.sessionId = (opts as any).sessionId;
      }

      const conversation = query(queryOpts);

      let resultContent = '';
      const messages: any[] = [];

      // Create an abort promise that rejects when the controller fires
      const abortPromise = new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(new Error('ABORT_SIGNAL')));
      });

      // Race the iteration against the abort signal
      const iterate = async () => {
        for await (const message of conversation) {
          messages.push(message);

          this.emit('stream', message);
          this.emit('token-estimate', message);

          if (message.type === 'assistant') {
            const content = (message as any).message?.content;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'text') resultContent += block.text;
              }
            }
          }

          if (message.type === 'result') {
            resultContent = (message as any).result ?? resultContent;
          }
        }
      };

      await Promise.race([iterate(), abortPromise]);

      return {
        success: true,
        data: {
          content: resultContent,
          messages,
          model: opts.model,
        },
      };
    } catch (err: any) {
      if (controller.signal.aborted || err?.message === 'ABORT_SIGNAL') {
        return {
          success: false,
          error: 'TIMEOUT',
          message: 'The Deadline was reached. Time ran out.',
        };
      }
      return {
        success: false,
        error: 'CRASH',
        message: String(err?.message ?? err),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
