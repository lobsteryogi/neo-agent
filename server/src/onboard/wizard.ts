/**
 * ░▒▓ WAKE UP, NEO ▓▒░
 *
 * "The Matrix has you... Follow the white rabbit."
 *
 * Onboard wizard orchestrator — delegates to modular step files.
 * Blue Pill: 3 steps with sensible defaults.
 * Red Pill: 11 steps for total control.
 */

import * as clack from '@clack/prompts';
import type { WizardAnswers } from '@neo-agent/shared';
import { WIZARD_DEFAULTS } from '@neo-agent/shared';
import { Q } from '../data/matrix-quotes.js';
import {
  WAKE_UP_ART,
  color,
  digitalRain,
  matrixBox,
  randomQuote,
  sectionHeader,
  sleep,
  typeText,
} from '../utils/terminal.js';
import { showStepHeader } from './progress.js';
import type { StepDefinition, WizardContext } from './types.js';

// Re-export generators for backward compatibility with tests
export { generateClaudeSettings, generateEnvFile, generateWorkspaceFiles } from './generators.js';

// ─── Step Registry (lazy-loaded) ───────────────────────────────

async function loadRedPillSteps(): Promise<StepDefinition[]> {
  return [
    { name: 'The Choice', codename: 'The Choice', run: (await import('./steps/01-choice.js')).run },
    { name: 'Identity', codename: 'Identity', run: (await import('./steps/02-identity.js')).run },
    {
      name: 'Claude Link',
      codename: 'Claude Link',
      run: (await import('./steps/03-claude-link.js')).run,
    },
    {
      name: 'The Construct',
      codename: 'The Construct',
      run: (await import('./steps/04-construct.js')).run,
    },
    {
      name: 'Phone Lines',
      codename: 'Phone Lines',
      run: (await import('./steps/05-phone-lines.js')).run,
    },
    {
      name: 'Free Will',
      codename: 'Free Will',
      run: (await import('./steps/06-free-will.js')).run,
    },
    { name: 'Déjà Vu', codename: 'Déjà Vu', run: (await import('./steps/07-deja-vu.js')).run },
    {
      name: 'Dodge This',
      codename: 'Dodge This',
      run: (await import('./steps/08-dodge-this.js')).run,
    },
    {
      name: 'Matrix Sync',
      codename: 'Matrix Sync',
      run: (await import('./steps/09-matrix-sync.js')).run,
    },
    { name: 'Kung Fu', codename: 'Kung Fu', run: (await import('./steps/10-kung-fu.js')).run },
    {
      name: 'Awakening',
      codename: 'The Awakening',
      run: (await import('./steps/11-awakening.js')).run,
    },
  ];
}

// ─── Entrypoint ────────────────────────────────────────────────

export async function runWizard(): Promise<void> {
  // ─── Animated Intro ─────────────────────────────────────────
  console.clear();
  console.log(digitalRain(3, 70));
  console.log(WAKE_UP_ART);
  console.log();
  await sleep(500);
  await typeText(`  ${Q.matrixHasYou}`, 50);
  await sleep(800);
  await typeText(`  ${Q.followWhiteRabbit}`, 40);
  await sleep(300);
  await typeText(`  ${color.dim(Q.noOneCanBeTold)}`, 20);
  await sleep(400);
  console.log();
  clack.intro(color.phosphor('░▒▓ WAKE UP, NEO ▓▒░'));

  // Load step registry
  const allSteps = await loadRedPillSteps();

  // ─── Step 1: The Choice ───────────────────────────────────
  const choiceResult = await allSteps[0].run(
    {},
    {
      index: 1,
      total: 11,
      name: 'The Choice',
      codename: 'The Choice',
    },
  );
  const pill = (choiceResult.answers as any).pill as 'red' | 'blue';

  let answers: WizardAnswers;

  if (pill === 'blue') {
    answers = await runBluePill();
  } else {
    answers = await runRedPill(allSteps);
  }

  // ─── Recap & Confirm ─────────────────────────────────────
  console.log(sectionHeader('CONSTRUCT REVIEW'));
  console.log();
  console.log(
    matrixBox(
      'YOUR CONFIGURATION',
      [
        color.green(`Agent:       ${answers.agentName}`),
        color.green(`Human:       ${answers.userName}`),
        color.green(`Model:       ${answers.defaultModel}`),
        color.green(`Router:      ${answers.routingProfile}`),
        color.green(`Personality: ${answers.personalityIntensity}`),
        color.green(`Verbosity:   ${answers.verbosity}`),
        color.green(`Port:        ${answers.port}`),
        color.green(`Dashboard:   ${answers.enableDashboard ? 'enabled' : 'disabled'}`),
        color.green(`Gate Phrase: ${answers.gatePhrase}`),
        color.green(`Fade:        ${answers.fadeThreshold}`),
        '',
        answers.composioApiKey
          ? color.dim(`Composio:    ✓ configured`)
          : color.dim(`Composio:    ─ skipped`),
        answers.telegramBotToken
          ? color.dim(`Telegram:    ✓ configured`)
          : color.dim(`Telegram:    ─ skipped`),
        answers.geminiApiKey
          ? color.dim(`Gemini:      ✓ configured`)
          : color.dim(`Gemini:      ─ skipped (FTS5 mode)`),
        answers.syncRepo
          ? color.dim(`Sync Repo:   ✓ configured`)
          : color.dim(`Sync Repo:   ─ skipped`),
      ],
      'info',
    ),
  );
  console.log();

  const proceed = await clack.confirm({
    message: 'Proceed with this configuration?',
    initialValue: true,
  });
  if (clack.isCancel(proceed) || !proceed) {
    clack.cancel(Q.stayInMatrix);
    process.exit(0);
  }

  // ─── Step 11: The Awakening ───────────────────────────────
  const awakeningStep = allSteps[allSteps.length - 1];
  await awakeningStep.run(answers, {
    index: 11,
    total: 11,
    name: 'Awakening',
    codename: 'The Awakening',
  });

  // ─── Victory Banner ───────────────────────────────────────
  console.log();
  console.log(digitalRain(2, 70));
  console.log(
    matrixBox(
      'THE CONSTRUCT IS READY',
      [
        color.green(`Agent: ${answers.agentName}`),
        color.green(`Human: ${answers.userName}`),
        color.green(`Model: ${answers.defaultModel}`),
        '',
        color.dim(`"${randomQuote()}"`),
      ],
      'success',
    ),
  );

  console.log();
  clack.outro(
    color.phosphor('Welcome to the real world. 🕶️') +
      color.dim('\n  Run ') +
      color.matrix('pnpm neo:dev') +
      color.dim(' to start Neo.'),
  );
}

// ─── Blue Pill (4 steps with defaults) ─────────────────────────

async function runBluePill(): Promise<WizardAnswers> {
  showStepHeader({ index: 2, total: 4, name: 'Identity', codename: 'Identity' });

  const userName = await clack.text({
    message: 'What should I call you?',
    placeholder: 'Your name',
    validate: (v) => (v.length === 0 ? 'I need to call you something.' : undefined),
  });
  if (clack.isCancel(userName)) process.exit(0);

  // Verify Claude CLI
  showStepHeader({ index: 3, total: 4, name: 'Claude Link', codename: 'Claude Link' });

  const s = clack.spinner();
  s.start('Checking for Claude CLI...');
  try {
    const { execSync } = await import('child_process');
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

  // Optional integrations (quick setup)
  showStepHeader({ index: 4, total: 4, name: 'Phone Lines', codename: 'Phone Lines' });

  const telegramBotToken = await clack.text({
    message: '📱 Telegram bot token (optional):',
    placeholder: 'Skip with Enter',
    defaultValue: '',
  });
  if (clack.isCancel(telegramBotToken)) process.exit(0);

  clack.log.info(
    'Using sensible defaults for everything else. You can re-run with Red Pill anytime.',
  );

  return {
    ...WIZARD_DEFAULTS,
    userName: userName as string,
    telegramBotToken: (telegramBotToken as string) || undefined,
  };
}

// ─── Red Pill (Full 11-step config) ────────────────────────────

async function runRedPill(allSteps: StepDefinition[]): Promise<WizardAnswers> {
  const ctx: WizardContext = {};

  // Steps 2-10 (step 1 already ran, step 11 runs after recap)
  const steps = allSteps.slice(1, -1);

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const meta = {
      index: i + 2, // offset: step 1 (choice) already ran
      total: 11,
      name: step.name,
      codename: step.codename,
    };

    const result = await step.run(ctx, meta);
    Object.assign(ctx, result.answers);
  }

  return {
    ...WIZARD_DEFAULTS,
    ...ctx,
    dailyLogCron: '0 23 * * *',
    maxStories: 5,
  } as WizardAnswers;
}
