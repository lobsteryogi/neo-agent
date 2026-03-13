/**
 * ░▒▓ STEP 07 — DÉJÀ VU ▓▒░
 *
 * "A déjà vu is usually a glitch in the Matrix."
 *
 * Fade threshold, Gemini API key for semantic search.
 */

import * as clack from '@clack/prompts';
import { showStepHeader } from '../progress.js';
import type { StepFn, StepResult } from '../types.js';

export const run: StepFn = async (_ctx, meta): Promise<StepResult> => {
  showStepHeader(meta);

  const fadeThreshold = await clack.text({
    message: '💾 Context fade threshold (0.5 – 0.95):',
    placeholder: '0.85',
    defaultValue: '0.85',
    validate: (v) => {
      const n = Number(v);
      return isNaN(n) || n < 0.5 || n > 0.95 ? 'Must be between 0.5 and 0.95' : undefined;
    },
  });
  if (clack.isCancel(fadeThreshold)) process.exit(0);

  return {
    answers: {
      fadeThreshold: Number(fadeThreshold) || 0.85,
    },
  };
};
