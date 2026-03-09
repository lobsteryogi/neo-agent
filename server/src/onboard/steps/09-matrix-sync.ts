/**
 * ░▒▓ STEP 09 — MATRIX SYNC ▓▒░
 *
 * "Everything that has a beginning has an end."
 *
 * Git sync repo URL.
 */

import * as clack from '@clack/prompts';
import { showStepHeader } from '../progress.js';
import type { StepFn, StepResult } from '../types.js';

export const run: StepFn = async (_ctx, meta): Promise<StepResult> => {
  showStepHeader(meta);

  const syncRepo = await clack.text({
    message: '🔄 Git sync repo URL:',
    placeholder: 'Skip with Enter',
    defaultValue: '',
  });
  if (clack.isCancel(syncRepo)) process.exit(0);

  return {
    answers: {
      syncRepo: (syncRepo as string) || undefined,
    },
  };
};
