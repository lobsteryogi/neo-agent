/**
 * ░▒▓ STEP 03 — CLAUDE LINK ▓▒░
 *
 * "I know why you're here."
 *
 * Verify Claude CLI is installed & authenticated.
 */

import * as clack from '@clack/prompts';
import { execSync } from 'child_process';
import { showStepHeader } from '../progress.js';
import type { StepFn, StepResult } from '../types.js';

export const run: StepFn = async (_ctx, meta): Promise<StepResult> => {
  showStepHeader(meta);

  const s = clack.spinner();
  s.start('Checking for Claude CLI...');

  try {
    const version = execSync('claude --version 2>/dev/null', { encoding: 'utf-8' }).trim();
    s.stop(`Claude CLI found: ${version}`);
  } catch {
    s.stop('Claude CLI not found!');
    clack.log.warn(
      'Claude Code CLI is required. Install it with:\n' +
        '  npm install -g @anthropic-ai/claude-code\n' +
        'Then authenticate with: claude login',
    );

    const cont = await clack.confirm({
      message: "Continue anyway? (some features won't work)",
      initialValue: false,
    });
    if (clack.isCancel(cont) || !cont) process.exit(1);
  }

  const permissionMode = await clack.select({
    message: '🔐 Claude permission mode:',
    options: [
      { value: 'default', label: 'Default — Ask before edits', hint: 'safest' },
      { value: 'acceptEdits', label: 'Accept Edits — Auto-approve file changes' },
      { value: 'bypassPermissions', label: 'Bypass All — Full autonomy', hint: 'dangerous' },
    ],
  });
  if (clack.isCancel(permissionMode)) process.exit(0);

  return { answers: { permissionMode: permissionMode as string } };
};
