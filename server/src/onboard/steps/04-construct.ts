/**
 * ░▒▓ STEP 04 — THE CONSTRUCT ▓▒░
 *
 * "This is the construct. It's our loading program."
 *
 * Dashboard toggle, server port, model selection.
 */

import * as clack from '@clack/prompts';
import type { ModelTier } from '@neo-agent/shared';
import { showStepHeader } from '../progress.js';
import type { StepFn, StepResult } from '../types.js';

export const run: StepFn = async (_ctx, meta): Promise<StepResult> => {
  showStepHeader(meta);

  const defaultModel = await clack.select({
    message: '🧠 Default model:',
    options: [
      { value: 'haiku', label: 'Haiku — Fast & cheap' },
      { value: 'sonnet', label: 'Sonnet — Balanced', hint: 'recommended' },
      { value: 'opus', label: 'Opus — Maximum intelligence' },
    ],
  });
  if (clack.isCancel(defaultModel)) process.exit(0);

  const enableDashboard = await clack.confirm({
    message: '📊 Enable web dashboard?',
    initialValue: true,
  });
  if (clack.isCancel(enableDashboard)) process.exit(0);

  const port = await clack.text({
    message: '🔌 Server port:',
    placeholder: '3141',
    defaultValue: '3141',
    validate: (v) => (isNaN(Number(v)) ? 'Must be a number' : undefined),
  });
  if (clack.isCancel(port)) process.exit(0);

  return {
    answers: {
      defaultModel: defaultModel as ModelTier,
      enableDashboard: enableDashboard as boolean,
      port: Number(port) || 3141,
      wsPort: (Number(port) || 3141) + 1,
    },
  };
};
