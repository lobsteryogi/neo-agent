/**
 * ░▒▓ STEP 06 — FREE WILL ▓▒░
 *
 * "You have to let it all go, Neo. Fear, doubt, and disbelief."
 *
 * Gate approval phrase, protected paths.
 */

import * as clack from '@clack/prompts';
import { showStepHeader } from '../progress.js';
import type { StepFn, StepResult } from '../types.js';

export const run: StepFn = async (_ctx, meta): Promise<StepResult> => {
  showStepHeader(meta);

  const gatePhrase = await clack.text({
    message: '🚪 Gate approval phrase:',
    placeholder: 'do it',
    defaultValue: 'do it',
  });
  if (clack.isCancel(gatePhrase)) process.exit(0);

  return {
    answers: {
      gatePhrase: (gatePhrase as string) || 'do it',
      protectedPaths: ['~/.ssh/', '~/.gnupg/', '.env'],
    },
  };
};
