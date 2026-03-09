/**
 * ░▒▓ STEP 01 — THE CHOICE ▓▒░
 *
 * "This is your last chance. After this, there is no turning back."
 *
 * Red pill / Blue pill selector.
 */

import * as clack from '@clack/prompts';
import { Q } from '../../data/matrix-quotes.js';
import { showStepHeader } from '../progress.js';
import type { StepMeta, StepResult, WizardContext } from '../types.js';

export async function run(
  _ctx: WizardContext,
  meta: StepMeta,
): Promise<StepResult & { answers: { pill: 'red' | 'blue' } }> {
  showStepHeader(meta);

  const pill = await clack.select({
    message: 'Choose your path:',
    options: [
      {
        value: 'blue',
        label: '💊 Blue Pill — Stay in wonderland (3 steps, sensible defaults)',
        hint: 'recommended',
      },
      {
        value: 'red',
        label: '🔴 Red Pill — See how deep the rabbit hole goes (11 steps, total control)',
      },
    ],
  });

  if (clack.isCancel(pill)) {
    clack.cancel(Q.stayInMatrix);
    process.exit(0);
  }

  return { answers: { pill: pill as 'red' | 'blue' } };
}
