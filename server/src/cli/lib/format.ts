/**
 * ░▒▓ CLI FORMATTING ▓▒░
 *
 * "I can only show you the door."
 *
 * Display helpers: token/cost formatting, stats, banner, prompt.
 */

import { getQuote } from '../../data/matrix-quotes.js';
import { color, digitalRain, gradient } from '../../utils/terminal.js';
import type { SessionState } from './sessions.js';

// ─── ANSI Reset ───────────────────────────────────────────────
export const R = '\x1b[0m';

// ─── Follow-up Detection ──────────────────────────────────────

export { isShortFollowup } from '../../utils/patterns.js';

// ─── Token / Cost formatting ───────────────────────────────────

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function fmtCost(usd: number): string {
  if (usd < 0.01) return `$${(usd * 100).toFixed(2)}¢`;
  return `$${usd.toFixed(4)}`;
}

// All current Claude models share the same 200k context window
const CONTEXT_LIMIT = 200_000;

function shortSession(id: string): string {
  return id.length > 6 ? id.slice(0, 6) + '…' : id;
}

export function statsLine(
  output: number,
  sessionTotal: number,
  cost: number,
  durationMs: number,
  model?: string,
  routeScore?: number,
  compaction?: { summarized: number; kept: number } | null,
  turns?: number,
  compactThreshold?: number,
  sessionId?: string,
): string {
  const dur = (durationMs / 1000).toFixed(1);
  const modelTag = model ? ` ${color.magenta(model)}` : '';
  const routeTag =
    routeScore !== undefined ? ` ${color.dimCyan(`r:${routeScore.toFixed(2)}`)}` : '';
  let compactTag = '';
  if (compaction) {
    compactTag = ` ${color.darkGreen(`▓${compaction.summarized}→${compaction.kept}`)}`;
  } else if (turns !== undefined && compactThreshold !== undefined) {
    compactTag = ` ${color.dim(`▓${turns}/${compactThreshold}`)}`;
  }
  const ctxGauge = `${color.green(fmtTokens(sessionTotal))}${color.dim(`/${fmtTokens(CONTEXT_LIMIT)}`)}`;
  const sessionTag = sessionId
    ? `${color.dim('[')}${color.dimCyan(shortSession(sessionId))}${color.dim(']')} `
    : '';
  return `  ${color.darkGreen('┗━')} ${sessionTag}${color.neonCyan(`↓${fmtTokens(output)}`)} ${color.neonYellow(fmtCost(cost))} ${color.dim(`${dur}s`)}  Σ${ctxGauge}${modelTag}${routeTag}${compactTag}`;
}

export function sessionInfo(s: SessionState): string {
  const totalTokens = s.totalInputTokens + s.totalOutputTokens;
  return `${color.dim('session:')}${color.neonCyan(s.id)} ${color.dim('turns:')}${color.green(String(s.turns))} ${color.dim('tokens:')}${color.brightGreen(fmtTokens(totalTokens))} ${color.dim('cost:')}${color.neonYellow(fmtCost(s.totalCost))}`;
}

// ─── Banner & Prompt ──────────────────────────────────────────

export function buildBanner(): string {
  const rain = digitalRain(2, 52);
  const title = gradient('░▒▓  N E O   C H A T  ▓▒░', [0, 255, 65], [0, 200, 255]);
  const quote = color.dim(color.italic(`"${getQuote('matrixHasYou')}"`));
  const hint = color.dimCyan('Type /help for commands. Ctrl+C to exit.');
  const line = color.darkGreen('━'.repeat(52));

  return ['', rain, `  ${line}`, `  ${title}`, `  ${line}`, `  ${quote}`, `  ${hint}`, ''].join(
    '\n',
  );
}

export function buildPrompt(sessionId: string, userName?: string): string {
  const name = userName ?? 'you';
  return `${color.dim('[')}${color.neonCyan(sessionId)}${color.dim(']')} ${gradient(`${name} ▸ `, [0, 255, 65], [200, 255, 200])}${R}`;
}
