/**
 * ░▒▓ STEP 05 — PHONE LINES ▓▒░
 *
 * "The phone is your way out."
 *
 * Composio API key, Telegram bot token.
 */

import * as clack from '@clack/prompts';
import { showStepHeader } from '../progress.js';
import type { StepFn, StepResult } from '../types.js';

export const run: StepFn = async (_ctx, meta): Promise<StepResult> => {
  showStepHeader(meta);

  const composioApiKey = await clack.text({
    message: '🔧 Composio API key (for tool integrations):',
    placeholder: 'Skip with Enter',
    defaultValue: '',
  });
  if (clack.isCancel(composioApiKey)) process.exit(0);

  const telegramBotToken = await clack.text({
    message: '📱 Telegram bot token:',
    placeholder: 'Skip with Enter',
    defaultValue: '',
  });
  if (clack.isCancel(telegramBotToken)) process.exit(0);

  return {
    answers: {
      composioApiKey: (composioApiKey as string) || undefined,
      telegramBotToken: (telegramBotToken as string) || undefined,
    },
  };
};
