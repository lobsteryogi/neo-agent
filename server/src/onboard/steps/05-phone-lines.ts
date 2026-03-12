/**
 * ░▒▓ STEP 05 — PHONE LINES ▓▒░
 *
 * "The phone is your way out."
 *
 * Composio API key, Telegram bot token, Tailscale.
 */

import * as clack from '@clack/prompts';
import { execSync } from 'child_process';
import { color } from '../../utils/terminal.js';
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

  // ─── Tailscale ─────────────────────────────────────────────
  clack.log.info('Checking Tailscale...');

  let tailscaleInstalled = false;
  let tailscaleConnected = false;
  let tailscaleTailnet = '';

  try {
    const raw = execSync('tailscale status --json', {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 8_000,
    });
    const data = JSON.parse(raw);
    tailscaleInstalled = true;
    tailscaleConnected = data.BackendState === 'Running';
    tailscaleTailnet = data.CurrentTailnet?.Name ?? '';
  } catch {
    tailscaleInstalled = false;
  }

  let tailscaleEnabled = false;

  if (!tailscaleInstalled) {
    clack.log.warn(
      `Tailscale not found. ${color.dim('Install from https://tailscale.com/download')}`,
    );
    const enable = await clack.confirm({
      message: 'Enable Tailscale support anyway? (you can install it later)',
      initialValue: false,
    });
    if (clack.isCancel(enable)) process.exit(0);
    tailscaleEnabled = enable as boolean;
  } else if (!tailscaleConnected) {
    clack.log.warn(`Tailscale installed but not connected. ${color.dim('Run `tailscale up`')}`);
    const enable = await clack.confirm({
      message: 'Enable Tailscale support? (connect it later with `tailscale up`)',
      initialValue: true,
    });
    if (clack.isCancel(enable)) process.exit(0);
    tailscaleEnabled = enable as boolean;
  } else {
    clack.log.success(
      `Tailscale connected ${tailscaleTailnet ? color.dim(`(${tailscaleTailnet})`) : ''}`,
    );
    const enable = await clack.confirm({
      message: 'Enable Tailscale integration?',
      initialValue: true,
    });
    if (clack.isCancel(enable)) process.exit(0);
    tailscaleEnabled = enable as boolean;
  }

  return {
    answers: {
      composioApiKey: (composioApiKey as string) || undefined,
      telegramBotToken: (telegramBotToken as string) || undefined,
      tailscaleEnabled,
    },
  };
};
