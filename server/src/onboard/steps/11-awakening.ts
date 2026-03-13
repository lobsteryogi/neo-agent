/**
 * ░▒▓ STEP 11 — THE AWAKENING ▓▒░
 *
 * "He's beginning to believe."
 *
 * Generate .env, workspace files, init DB, run health check.
 */

import * as clack from '@clack/prompts';
import type { WizardAnswers } from '@neo-agent/shared';
import { existsSync } from 'fs';
import { join } from 'path';
import { NeoHome } from '../../core/neo-home.js';
import { color, sleep, status } from '../../utils/terminal.js';
import {
  generateClaudeSettings,
  generateEnvFile,
  generateWorkspaceFiles,
  initDatabase,
} from '../generators.js';
import { showStepHeader } from '../progress.js';
import type { StepFn, StepResult } from '../types.js';

export const run: StepFn = async (ctx, meta): Promise<StepResult> => {
  showStepHeader(meta);

  const answers = ctx as WizardAnswers;
  NeoHome.ensureStructure();
  const workspacePath = NeoHome.shared;

  const spinner = clack.spinner();

  // ─── Generate .env ────────────────────────────────────────
  spinner.start(color.green('Loading neural patterns...'));
  await sleep(600);
  generateEnvFile(answers);
  spinner.stop(status.ok('Environment matrix loaded'));

  // ─── Generate workspace files ─────────────────────────────
  spinner.start(color.green('Writing identity protocols...'));
  await sleep(400);
  generateWorkspaceFiles(answers, workspacePath);
  spinner.stop(status.ok('Identity protocols written'));

  // ─── Init database ────────────────────────────────────────
  spinner.start(color.green('Initializing memory constructs...'));
  await sleep(500);
  initDatabase();
  spinner.stop(status.ok('Memory constructs initialized'));

  // ─── Claude settings ──────────────────────────────────────
  spinner.start(color.green('Installing permission gates...'));
  await sleep(300);
  generateClaudeSettings(answers, workspacePath);
  spinner.stop(status.ok('Permission gates installed'));

  // ─── Health check ─────────────────────────────────────────
  spinner.start(color.green('Running construct health check...'));
  await sleep(400);

  const checks = [
    { label: 'config.env', ok: existsSync(NeoHome.configEnv) },
    { label: 'AGENTS.md', ok: existsSync(join(workspacePath, 'AGENTS.md')) },
    { label: 'SOUL.md', ok: existsSync(join(workspacePath, 'SOUL.md')) },
    { label: 'USER.md', ok: existsSync(join(workspacePath, 'USER.md')) },
    { label: 'TOOLS.md', ok: existsSync(join(workspacePath, 'TOOLS.md')) },
    { label: 'BOOTSTRAP.md', ok: existsSync(join(workspacePath, 'BOOTSTRAP.md')) },
    { label: 'HEARTBEAT.md', ok: existsSync(join(workspacePath, 'HEARTBEAT.md')) },
    { label: 'stories/', ok: existsSync(join(workspacePath, 'stories', '01-who-i-am.md')) },
    { label: 'skills/', ok: existsSync(join(NeoHome.skills)) },
    { label: 'agents/', ok: existsSync(join(NeoHome.agents)) },
    {
      label: '.claude/settings.json',
      ok: existsSync(join(workspacePath, '.claude', 'settings.json')),
    },
    { label: 'neo.db', ok: existsSync(NeoHome.db) },
  ];

  const allOk = checks.every((c) => c.ok);
  spinner.stop(allOk ? status.ok('All systems nominal') : status.warn('Some files missing'));

  console.log();
  for (const check of checks) {
    console.log(
      check.ok
        ? `    ${color.phosphor('✓')} ${color.green(check.label)}`
        : `    ${color.red('✗')} ${color.red(check.label)} ${color.dim('— missing')}`,
    );
  }

  return { answers: {} };
};
