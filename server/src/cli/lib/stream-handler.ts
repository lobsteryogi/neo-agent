/**
 * ░▒▓ STREAM HANDLER ▓▒░
 *
 * "Guns. Lots of guns."
 *
 * Handles SDK stream events: text rendering, tool progress, token capture.
 */

import type { ClaudeBridge } from '../../core/claude-bridge.js';
import { color } from '../../utils/terminal.js';

const R = '\x1b[0m';

// ─── Stream Context ───────────────────────────────────────────

export interface StreamContext {
  firstToken: boolean;
  toolActive: boolean;
  fullResponse: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  costUsd: number;
  modelUsed?: string;
  sdkSessionId?: string;
}

export function createStreamContext(): StreamContext {
  return {
    firstToken: false,
    toolActive: false,
    fullResponse: '',
    totalInputTokens: 0,
    totalOutputTokens: 0,
    costUsd: 0,
  };
}

// ─── Handler ──────────────────────────────────────────────────

export function attachStreamHandler(
  bridge: ClaudeBridge,
  ctx: StreamContext,
  spinner: ReturnType<typeof setInterval>,
): void {
  bridge.on('stream', (msg: any) => {
    if (msg.type === 'assistant') {
      if (msg.message?.model) ctx.modelUsed = msg.message.model;

      const content = msg.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && block.text) {
            if (!ctx.firstToken) {
              ctx.firstToken = true;
              clearInterval(spinner);
              process.stdout.write(
                `\r\x1b[K${color.neonCyan(color.bold('neo'))} ${color.electricBlue('▸')} ${R}`,
              );
            } else if (ctx.toolActive) {
              // Returning from tool use → fresh line with prompt
              ctx.toolActive = false;
              process.stdout.write(
                `\r\x1b[K${color.neonCyan(color.bold('neo'))} ${color.electricBlue('▸')} ${R}`,
              );
            }
            process.stdout.write(block.text);
            ctx.fullResponse += block.text;
          }

          // ── Tool use: show what the agent is doing ──────────
          if (block.type === 'tool_use' && block.name) {
            if (!ctx.firstToken) {
              ctx.firstToken = true;
              clearInterval(spinner);
            }
            ctx.toolActive = true;
            const toolLabel = block.name;
            const input = block.input as Record<string, unknown> | undefined;
            const target =
              (input?.file_path as string) ??
              (input?.path as string) ??
              (input?.command as string)?.slice(0, 60) ??
              '';
            const shortTarget = target ? ` ${color.dim(target)}` : '';
            process.stdout.write(
              `\r\x1b[K  ${color.darkGreen('⚡')} ${color.dimCyan(toolLabel)}${shortTarget}\n`,
            );
          }
        }
      }
    }

    // ── Live tool progress (elapsed time updates) ──────────
    if (msg.type === 'tool_progress' && msg.tool_name) {
      const elapsed = msg.elapsed_time_seconds?.toFixed(1) ?? '?';
      process.stdout.write(
        `\r\x1b[K  ${color.darkGreen('⚙')} ${color.dimCyan(msg.tool_name)} ${color.dim(`${elapsed}s`)}`,
      );
    }

    // ── Tool use summary ───────────────────────────────────
    if (msg.type === 'tool_use_summary' && msg.summary) {
      process.stdout.write(
        `\r\x1b[K  ${color.darkGreen('✓')} ${color.dim(msg.summary.slice(0, 80))}\n`,
      );
    }

    // Capture session ID from any event that carries it
    if (msg.session_id && !ctx.sdkSessionId) {
      ctx.sdkSessionId = msg.session_id;
    }

    // Capture tokens + cost from result.modelUsage (authoritative source)
    if (msg.type === 'result' && msg.modelUsage) {
      for (const usage of Object.values(msg.modelUsage) as any[]) {
        ctx.totalInputTokens += usage.inputTokens ?? usage.input_tokens ?? 0;
        ctx.totalOutputTokens += usage.outputTokens ?? usage.output_tokens ?? 0;
        ctx.costUsd += usage.costUSD ?? 0;
      }
    }
  });
}
