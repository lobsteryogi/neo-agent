/**
 * ░▒▓ STEP 02 — IDENTITY ▓▒░
 *
 * "I know kung fu."
 *
 * Agent name, user name, personality intensity, verbosity.
 */

import * as clack from '@clack/prompts';
import type { VerbosityLevel } from '@neo-agent/shared';
import { showStepHeader } from '../progress.js';
import type { StepFn, StepResult } from '../types.js';

export const run: StepFn = async (_ctx, meta): Promise<StepResult> => {
  showStepHeader(meta);

  const userName = await clack.text({
    message: '👤 What should I call you?',
    placeholder: 'Your name',
    validate: (v) => (v.length === 0 ? 'I need a name.' : undefined),
  });
  if (clack.isCancel(userName)) process.exit(0);

  const agentName = await clack.text({
    message: '🤖 What should your agent be called?',
    placeholder: 'Neo',
    defaultValue: 'Neo',
  });
  if (clack.isCancel(agentName)) process.exit(0);

  const personalityIntensity = await clack.select({
    message: '🎭 Personality intensity:',
    options: [
      { value: 'minimal', label: 'Minimal — Professional, less quips' },
      { value: 'moderate', label: 'Moderate — Some personality, balanced' },
      {
        value: 'full-existential-crisis',
        label: 'Full Existential Crisis — Maximum Neo vibes',
        hint: 'recommended',
      },
    ],
  });
  if (clack.isCancel(personalityIntensity)) process.exit(0);

  const verbosity = await clack.select({
    message: '📏 Response verbosity:',
    options: [
      { value: 'concise', label: 'Concise — Short, punchy answers' },
      { value: 'balanced', label: 'Balanced — Clear with enough detail', hint: 'recommended' },
      { value: 'detailed', label: 'Detailed — Thorough explanations' },
    ],
  });
  if (clack.isCancel(verbosity)) process.exit(0);

  return {
    answers: {
      userName: userName as string,
      agentName: (agentName as string) || 'Neo',
      personalityIntensity: personalityIntensity as string,
      verbosity: verbosity as VerbosityLevel,
    },
  };
};
