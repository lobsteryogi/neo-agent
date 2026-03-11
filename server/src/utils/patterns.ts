/**
 * ░▒▓ SHARED PATTERNS ▓▒░
 *
 * "I know kung fu. Well, I know pattern matching."
 *
 * Reusable detection patterns shared across CLI and agent pipeline.
 */

import type { ModelTier, RoutingProfile } from '@neo-agent/shared';
import type { LogEntry } from './logger.js';

// ─── Constants ────────────────────────────────────────────────

export const VALID_MODEL_TIERS: readonly ModelTier[] = ['haiku', 'sonnet', 'opus'] as const;
export const VALID_ROUTING_PROFILES: readonly RoutingProfile[] = [
  'auto',
  'eco',
  'balanced',
  'premium',
] as const;

// ─── Short Followup Detection ─────────────────────────────────

const SHORT_FOLLOWUP_RE =
  /^(ok|okay|yes|yep|yeah|yea|sure|go|go ahead|do it|proceed|continue|y|k|👍|please|pls|correct|right|exactly|that|this|alright|aye|roger|bet|cool|fine|sounds good|ship it|lgtm|let's go|go for it|make it so|affirmative)$/i;

export function isShortFollowup(input: string): boolean {
  return input.length <= 40 && SHORT_FOLLOWUP_RE.test(input.trim());
}

// ─── Debug Intent Detection ───────────────────────────────────

export function isDebugIntent(content: string): boolean {
  const lower = content.toLowerCase();
  return (
    /\b(debug|diagnose|trace|inspect|self-debug)\b/.test(lower) ||
    /\b(what happened|why did you|what went wrong|how did you|what did you do)\b/.test(lower) ||
    /\b(too slow|took too long|wrong answer|incorrect|you (were|are) wrong|broke|broken|failing)\b/.test(
      lower,
    ) ||
    /\b(how do you work|your (logs?|pipeline|process|routing|thinking)|show me your|explain your)\b/.test(
      lower,
    ) ||
    /\b(something (is )?wrong|not working|didn'?t work|error|issue|problem|bug)\b/.test(lower)
  );
}

// ─── Timeout Calculation ──────────────────────────────────────

export function calculateTimeoutMs(complexity: number): number {
  if (complexity >= 0.7) return 600_000;
  if (complexity >= 0.4) return 300_000;
  return 120_000;
}

// ─── Debug Context Building ───────────────────────────────────

export function formatDebugLogs(entries: LogEntry[]): string {
  return entries
    .map((e) => {
      const data = e.data && Object.keys(e.data).length > 0 ? ` ${JSON.stringify(e.data)}` : '';
      const err = e.error ? ` ERROR: ${e.error.message}` : '';
      return `[${e.timestamp.slice(11, 23)}] ${e.level.toUpperCase()} [${e.namespace}] ${e.message}${data}${err}`;
    })
    .join('\n');
}

export function injectDebugContext(systemPrompt: string, logText: string): string {
  return (
    systemPrompt +
    `\n\n## Self-Debug Context\n\nThe user appears to be asking about your behavior, performance, or a problem they encountered. Below are your recent internal pipeline logs — use them to explain what happened, diagnose issues, or reason about your own processing. Be transparent and helpful.\n\n<debug_logs>\n${logText}\n</debug_logs>`
  );
}

export function injectCompactedContext(systemPrompt: string, compactedContext: string): string {
  return (
    systemPrompt +
    `\n\n## Compacted Context (from previous conversation)\n\nThe conversation was compacted. Below is a summary of the key context from the previous turns. Use this to maintain continuity.\n\n${compactedContext}`
  );
}

// ─── Transcript Export ────────────────────────────────────────

export function buildTranscriptMarkdown(
  session: {
    id: string;
    turns: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCost: number;
  },
  history: { role: string; content: string }[],
  fmtTokensFn: (n: number) => string,
  fmtCostFn: (n: number) => string,
): string {
  const date = new Date().toISOString().slice(0, 10);
  const lines = [
    `# Neo Session Export`,
    ``,
    `**Session:** \`${session.id}\``,
    `**Date:** ${date}`,
    `**Turns:** ${session.turns}`,
    `**Tokens:** ${fmtTokensFn(session.totalInputTokens + session.totalOutputTokens)}`,
    `**Cost:** ${fmtCostFn(session.totalCost)}`,
    ``,
    `---`,
    ``,
  ];
  for (const m of history) {
    lines.push(`## ${m.role === 'user' ? '👤 You' : '🤖 Neo'}`);
    lines.push(``);
    lines.push(m.content ?? '');
    lines.push(``);
  }
  return lines.join('\n');
}
