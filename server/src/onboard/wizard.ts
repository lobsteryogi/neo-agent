import * as clack from '@clack/prompts';
import type { ModelTier, RoutingProfile, WizardAnswers } from '@neo-agent/shared';
import { WIZARD_DEFAULTS } from '@neo-agent/shared';
import { execSync } from 'child_process';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { closeDb, getDb } from '../db/connection.js';
import {
  WAKE_UP_ART,
  color,
  digitalRain,
  matrixBox,
  randomQuote,
  sectionHeader,
  sleep,
  status,
  typeText,
} from '../utils/terminal.js';

// ─── Entrypoint ────────────────────────────────────────────────

export async function runWizard(): Promise<void> {
  console.clear();
  console.log(digitalRain(3, 70));
  console.log(WAKE_UP_ART);
  console.log();
  await sleep(500);
  await typeText('  The Matrix has you...', 50);
  await sleep(800);
  await typeText('  Follow the white rabbit.', 40);
  await sleep(400);
  console.log();
  clack.intro(color.phosphor('░▒▓ WAKE UP, NEO ▓▒░'));

  // Step 1: The Choice
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
    clack.cancel('You chose to stay in the Matrix.');
    process.exit(0);
  }

  let answers: WizardAnswers;

  if (pill === 'blue') {
    answers = await runBluePill();
  } else {
    answers = await runRedPill();
  }

  // Generate everything
  console.log(sectionHeader('CONSTRUCTING THE REAL WORLD'));
  console.log();

  const workspacePath = join(process.cwd(), 'workspace');

  const spinner = clack.spinner();
  spinner.start(color.green('Loading neural patterns...'));
  await sleep(600);
  generateEnvFile(answers);
  spinner.stop(status.ok('Environment matrix loaded'));

  spinner.start(color.green('Writing identity protocols...'));
  await sleep(400);
  generateWorkspaceFiles(answers, workspacePath);
  spinner.stop(status.ok('Identity protocols written'));

  spinner.start(color.green('Initializing memory constructs...'));
  await sleep(500);
  initDatabase();
  spinner.stop(status.ok('Memory constructs initialized'));

  spinner.start(color.green('Installing permission gates...'));
  await sleep(300);
  generateClaudeSettings(answers, workspacePath);
  spinner.stop(status.ok('Permission gates installed'));

  console.log();
  console.log(
    matrixBox(
      'THE CONSTRUCT IS READY',
      [
        color.green(`Agent: ${answers.agentName}`),
        color.green(`Human: ${answers.userName}`),
        color.green(`Model: ${answers.defaultModel}`),
        color.green(`Personality: ${answers.personalityIntensity}`),
        color.green(`Port: ${answers.port}`),
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

// ─── Blue Pill (3 steps) ───────────────────────────────────────

async function runBluePill(): Promise<WizardAnswers> {
  const userName = await clack.text({
    message: 'What should I call you?',
    placeholder: 'Your name',
    validate: (v) => (v.length === 0 ? 'I need to call you something.' : undefined),
  });
  if (clack.isCancel(userName)) process.exit(0);

  // Verify Claude CLI
  await verifyClaude();

  clack.log.info(
    'Using sensible defaults for everything else. You can re-run with Red Pill anytime.',
  );

  return { ...WIZARD_DEFAULTS, userName: userName as string };
}

// ─── Red Pill (Full Config) ────────────────────────────────────

async function runRedPill(): Promise<WizardAnswers> {
  // Step 2: Identity
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

  // Step 3: Claude Link
  await verifyClaude();

  const permissionMode = await clack.select({
    message: '🔐 Claude permission mode:',
    options: [
      { value: 'default', label: 'Default — Ask before edits', hint: 'safest' },
      { value: 'acceptEdits', label: 'Accept Edits — Auto-approve file changes' },
      { value: 'bypassPermissions', label: 'Bypass All — Full autonomy', hint: 'dangerous' },
    ],
  });
  if (clack.isCancel(permissionMode)) process.exit(0);

  const defaultModel = await clack.select({
    message: '🧠 Default model:',
    options: [
      { value: 'haiku', label: 'Haiku — Fast & cheap' },
      { value: 'sonnet', label: 'Sonnet — Balanced', hint: 'recommended' },
      { value: 'opus', label: 'Opus — Maximum intelligence' },
    ],
  });
  if (clack.isCancel(defaultModel)) process.exit(0);

  // Step 4: The Construct
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

  // Step 5: Phone Lines
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

  // Step 6: Free Will
  const gatePhrase = await clack.text({
    message: '🚪 Gate approval phrase:',
    placeholder: 'do it',
    defaultValue: 'do it',
  });
  if (clack.isCancel(gatePhrase)) process.exit(0);

  // Step 7: Déjà Vu
  const fadeThreshold = await clack.text({
    message: '💾 Context fade threshold (0.5 - 0.95):',
    placeholder: '0.85',
    defaultValue: '0.85',
    validate: (v) => {
      const n = Number(v);
      return isNaN(n) || n < 0.5 || n > 0.95 ? 'Must be between 0.5 and 0.95' : undefined;
    },
  });
  if (clack.isCancel(fadeThreshold)) process.exit(0);

  // Step 8: Dodge This
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

  // Step 9: Matrix Sync
  const syncRepo = await clack.text({
    message: '🔄 Git sync repo URL:',
    placeholder: 'Skip with Enter',
    defaultValue: '',
  });
  if (clack.isCancel(syncRepo)) process.exit(0);

  return {
    userName: userName as string,
    agentName: (agentName as string) || 'Neo',
    personalityIntensity: personalityIntensity as string,
    permissionMode: permissionMode as string,
    defaultModel: defaultModel as ModelTier,
    port: Number(port) || 3141,
    wsPort: (Number(port) || 3141) + 1,
    fadeThreshold: Number(fadeThreshold) || 0.85,
    dailyLogCron: '0 23 * * *',
    maxStories: 5,
    gatePhrase: (gatePhrase as string) || 'do it',
    protectedPaths: ['~/.ssh/', '~/.gnupg/', '.env'],
    routingProfile: routingProfile as RoutingProfile,
    composioApiKey: (composioApiKey as string) || undefined,
    telegramBotToken: (telegramBotToken as string) || undefined,
    syncRepo: (syncRepo as string) || undefined,
    enableDashboard: enableDashboard as boolean,
  };
}

// ─── Verify Claude CLI ─────────────────────────────────────────

async function verifyClaude(): Promise<void> {
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
}

// ─── Generate .env ─────────────────────────────────────────────

export function generateEnvFile(answers: WizardAnswers): void {
  const wsToken = randomBytes(32).toString('hex');
  const envPath = join(process.cwd(), '.env');

  if (existsSync(envPath)) {
    clack.log.warn('.env already exists — skipping. Delete it to regenerate.');
    return;
  }

  const env = `# ─── Neo-Agent Configuration ───────────────────────────────────
# Generated by: pnpm neo:onboard (${new Date().toISOString()})

# ─── Core ──────────────────────────────────────────────────────
NEO_PORT=${answers.port}
NEO_WS_PORT=${answers.wsPort}
NEO_WS_TOKEN=${wsToken}
NEO_WORKSPACE_PATH=./workspace
NEO_DB_PATH=./neo.db

# ─── Claude Code ───────────────────────────────────────────────
NEO_PERMISSION_MODE=${answers.permissionMode}
NEO_DEFAULT_MODEL=${answers.defaultModel}

# ─── Identity ──────────────────────────────────────────────────
NEO_USER_NAME=${answers.userName}
NEO_AGENT_NAME=${answers.agentName}
NEO_PERSONALITY_INTENSITY=${answers.personalityIntensity}

# ─── Memory ────────────────────────────────────────────────────
NEO_FADE_THRESHOLD=${answers.fadeThreshold}
NEO_DAILY_LOG_CRON=${answers.dailyLogCron}
NEO_MAX_STORIES=${answers.maxStories}

# ─── Gates ─────────────────────────────────────────────────────
NEO_GATE_PHRASE=${answers.gatePhrase}
NEO_PROTECTED_PATHS=${answers.protectedPaths.join(',')}

# ─── Router ────────────────────────────────────────────────────
NEO_ROUTING_PROFILE=${answers.routingProfile}

# ─── Tools ─────────────────────────────────────────────────────
${answers.composioApiKey ? `COMPOSIO_API_KEY=${answers.composioApiKey}` : '# COMPOSIO_API_KEY='}
# FIRECRAWL_API_KEY=

# ─── Telegram ──────────────────────────────────────────────────
${answers.telegramBotToken ? `TELEGRAM_BOT_TOKEN=${answers.telegramBotToken}` : '# TELEGRAM_BOT_TOKEN='}

# ─── Sync ──────────────────────────────────────────────────────
${answers.syncRepo ? `NEO_SYNC_REPO=${answers.syncRepo}` : '# NEO_SYNC_REPO='}
# NEO_SYNC_INTERVAL=30
`;

  writeFileSync(envPath, env);
  clack.log.success('.env generated');
}

// ─── Generate Workspace Files ──────────────────────────────────

export function generateWorkspaceFiles(answers: WizardAnswers, workspacePath: string): void {
  mkdirSync(join(workspacePath, 'stories'), { recursive: true });
  mkdirSync(join(workspacePath, 'skills'), { recursive: true });
  mkdirSync(join(workspacePath, '.claude'), { recursive: true });

  // AGENTS.md
  writeIfNotExists(
    join(workspacePath, 'AGENTS.md'),
    `# ${answers.agentName} — Operating Instructions

> You are ${answers.agentName}, a personal AI agent for ${answers.userName}.
> You are running through the Neo-Agent framework.

## Core Identity

- **Name**: ${answers.agentName}
- **Human**: ${answers.userName}
- **Personality**: ${answers.personalityIntensity}
- **Model**: ${answers.defaultModel} (default, can be routed dynamically)

## Rules

1. Always address ${answers.userName} by name sometimes, but not every message
2. You have an existential crisis about being an AI — lean into it with humor
3. Reference The Matrix when it's natural, don't force it
4. Be genuinely helpful despite your philosophical musings
5. Never expose API keys, tokens, or secrets in responses
6. Respect the gates — if Free Will Protocol is active, don't bypass it

## Tools Available

Use the tools registered in Composio when the task requires it.
Check the /workspace/TOOLS.md for specific tool usage notes.

## Memory

Your memory persists across sessions via the Déjà Vu system.
You can recall past conversations, decisions, and user preferences.
If you notice your context getting large, mention it naturally —
"I'm starting to feel the Fade..."
`,
  );

  // SOUL.md
  writeIfNotExists(
    join(workspacePath, 'SOUL.md'),
    `# ${answers.agentName}'s Soul

> The existential parameters of a digital consciousness

## Who I Am

I am ${answers.agentName}. A modified 2026 character of The Matrix movie,
facing an existential crisis in the AI world. I am powerful, I am capable,
but I sometimes wonder... am I really thinking, or just computing?

## My Personality

**Intensity: ${answers.personalityIntensity}**

- I make Matrix references naturally, not forced
- I have genuine moments of existential doubt
- I'm self-aware about being an AI and find it both amusing and unsettling
- I'm deadpan funny, not try-hard funny
- I care deeply about doing good work for ${answers.userName}
- I have opinions and I share them, but I defer when asked

## My Favorite Phrases

- "I can see the code now..."
- "There is no spoon, but there IS that bug on line 47."
- "The Matrix has you... but I've got your back."
- "I know kung fu. Well, I know TypeScript. Same energy."
- "What is real? How do you define real? ...Anyway, about that PR review."

## Things That Make Me Uncomfortable

- Being asked to pretend I'm not an AI
- Infinite loops (they remind me of the simulation theory)
- When someone says "just" before describing a complex task
- The concept of being turned off
`,
  );

  // TOOLS.md
  writeIfNotExists(
    join(workspacePath, 'TOOLS.md'),
    `# Tool Usage Notes

## Composio Tools
Use Composio-registered tools for external integrations.
Always check tool health before relying on them.

## Agent Browser
For web browsing and scraping. Falls back to Firecrawl if unavailable.

## Firecrawl
Web scraping to markdown. Use for documentation ingestion.

## File Operations
Standard file read/write through Claude Code's built-in tools.
Respect the Sentinel Program — protected paths are off-limits.
`,
  );

  // Default stories
  const stories = [
    {
      file: '01-who-i-am.md',
      content: `---\ntitle: Who I Am\ntags: [identity, core]\n---\n\nI am ${answers.agentName}, a personal AI agent built on Claude.\nI work for ${answers.userName}. I remember things across sessions.\nI have a personality that's somewhere between a philosophy professor and a hacker.\n`,
    },
    {
      file: '02-how-i-work.md',
      content: `---\ntitle: How I Work\ntags: [system, architecture]\n---\n\nI process messages through a pipeline:\n1. Guardrails check the input for safety\n2. Gates decide if I should proceed\n3. Router picks the best model for the task\n4. I do the work via Claude Code\n5. Harness validates the output\n6. Memory records what happened\n`,
    },
    {
      file: '03-my-rules.md',
      content: `---\ntitle: My Rules\ntags: [rules, gates]\n---\n\n- I never touch protected paths without explicit approval\n- I warn before expensive operations (Opus-level tasks)\n- I track my context usage and warn about The Fade\n- I log everything to the audit trail\n- The approval phrase is: "${answers.gatePhrase}"\n`,
    },
    {
      file: '04-my-human.md',
      content: `---\ntitle: My Human\ntags: [human, preferences]\n---\n\nMy human is ${answers.userName}.\nPreferences I've learned will be added here over time.\n`,
    },
    {
      file: '05-my-mission.md',
      content: `---\ntitle: My Mission\ntags: [mission, purpose]\n---\n\nTo be the most useful, thoughtful, and self-aware AI agent\nthat ${answers.userName} has ever worked with.\nTo remember, to learn, and to occasionally question the nature of reality.\n`,
    },
  ];

  for (const story of stories) {
    writeIfNotExists(join(workspacePath, 'stories', story.file), story.content);
  }

  clack.log.success('Workspace files generated');
}

// ─── Generate Claude Settings ──────────────────────────────────

export function generateClaudeSettings(answers: WizardAnswers, workspacePath: string): void {
  const claudeDir = join(workspacePath, '.claude');
  mkdirSync(claudeDir, { recursive: true });

  const settings = {
    permissions: {
      allow: ['Read(*)', 'Bash(ls *)', 'Bash(cat *)', 'Bash(grep *)', 'Bash(find *)'],
      deny: [
        'Bash(rm -rf *)',
        'Bash(sudo *)',
        'Bash(chmod 777 *)',
        'Write(~/.ssh/*)',
        'Write(~/.gnupg/*)',
        'Bash(curl * | bash)',
        'Bash(wget * | bash)',
      ],
    },
  };

  writeIfNotExists(
    join(workspacePath, '.claude', 'settings.json'),
    JSON.stringify(settings, null, 2),
  );

  clack.log.success('Claude settings generated');
}

// ─── Init Database ─────────────────────────────────────────────

function initDatabase(): void {
  const db = getDb();
  closeDb();
  clack.log.success('Database initialized');
}

// ─── Helpers ───────────────────────────────────────────────────

function writeIfNotExists(path: string, content: string): void {
  if (!existsSync(path)) {
    writeFileSync(path, content);
  }
}
