/**
 * ░▒▓ STEP 08 — DODGE THIS ▓▒░
 *
 * "Dodge this."
 *
 * Default routing profile.
 */

import * as clack from '@clack/prompts';
import type { RoutingProfile } from '@neo-agent/shared';
import { showStepHeader } from '../progress.js';
import type { StepFn, StepResult } from '../types.js';

export const run: StepFn = async (_ctx, meta): Promise<StepResult> => {
  showStepHeader(meta);

  const routingProfile = await clack.select({
    message: '🧭 Default routing profile:',
    options: [
      { value: 'auto', label: 'Auto — Smart routing based on task', hint: 'recommended' },
      { value: 'eco', label: 'Eco — Prefer cheaper models' },
      { value: 'balanced', label: 'Balanced — Middle ground' },
      { value: 'premium', label: 'Premium — Prefer Opus' },
    ],
  });
  if (clack.isCancel(routingProfile)) process.exit(0);

  return { answers: { routingProfile: routingProfile as RoutingProfile } };
};
