/**
 * ░▒▓ WIZARD PROGRESS ▓▒░
 *
 * Matrix-themed progress bar for the onboard wizard.
 */

import { color, matrixProgress, sectionHeader } from '../utils/terminal.js';
import type { StepMeta } from './types.js';

// ─── Step Header ───────────────────────────────────────────────

/** Display a Matrix-styled step header with progress bar. */
export function showStepHeader(meta: StepMeta): void {
  const pct = Math.round((meta.index / meta.total) * 100);
  console.log();
  console.log(sectionHeader(`Step ${meta.index}/${meta.total} — ${meta.codename}`));
  console.log(matrixProgress(meta.name, meta.index, meta.total));
  console.log();
}

/** Display a completion bar for post-step feedback. */
export function showStepComplete(meta: StepMeta): void {
  console.log(color.dim(`  ✓ ${meta.codename} complete`));
}
