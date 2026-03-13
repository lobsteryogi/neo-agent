/**
 * ░▒▓ ONBOARD GENERATORS ▓▒░
 *
 * "He's beginning to believe."
 *
 * Pure generation functions extracted from the wizard.
 * These create configuration files, workspace structures, and initialize the database.
 *
 * Templates live as standalone .md files in ./templates/ and are rendered
 * at generation time with {{placeholder}} substitution.
 */

import * as clack from '@clack/prompts';
import type { WizardAnswers } from '@neo-agent/shared';
import { randomBytes } from 'crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { ensureDir } from '../utils/fs.js';
import { fileURLToPath } from 'url';

import { closeDb, getDb } from '../db/connection.js';

// ─── Constants ─────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_DIR = join(__dirname, 'templates');

// ─── Types ─────────────────────────────────────────────────────

export interface GenerationResult {
  generated: string[];
  skipped: string[];
}

// ─── Template Engine ───────────────────────────────────────────

type TemplateVars = Record<string, string>;

/**
 * Read a template file and replace {{placeholders}} with values.
 * Placeholders not found in vars are left untouched.
 */
function renderTemplate(templatePath: string, vars: TemplateVars = {}): string {
  const raw = readFileSync(templatePath, 'utf-8');
  return raw.replace(/\{\{(\w+)\}\}/g, (match, key: string) => vars[key] ?? match);
}

/**
 * Write rendered template to destination. Returns true if written, false if skipped.
 */
function writeTemplate(templatePath: string, destPath: string, vars: TemplateVars = {}): boolean {
  if (existsSync(destPath)) return false;
  const content = renderTemplate(templatePath, vars);
  writeFileSync(destPath, content);
  return true;
}

/**
 * Write raw content to destination. Returns true if written, false if skipped.
 */
function writeIfNotExists(path: string, content: string): boolean {
  if (existsSync(path)) return false;
  writeFileSync(path, content);
  return true;
}

// ─── Directory Setup ───────────────────────────────────────────

function ensureDirectories(workspacePath: string): void {
  const dirs = ['stories', 'skills', 'agents', '.claude'];
  for (const dir of dirs) {
    ensureDir(join(workspacePath, dir));
  }
}

// ─── Template Variables ────────────────────────────────────────

function buildTemplateVars(answers: WizardAnswers): TemplateVars {
  return {
    agentName: answers.agentName,
    userName: answers.userName,
    defaultModel: answers.defaultModel,
    personalityIntensity: answers.personalityIntensity,
    gatePhrase: answers.gatePhrase,
  };
}

// ─── System Templates ──────────────────────────────────────────

function generateSystemTemplates(
  vars: TemplateVars,
  workspacePath: string,
  templatesDir: string,
): GenerationResult {
  const result: GenerationResult = { generated: [], skipped: [] };

  const systemFiles = [
    'AGENTS.md',
    'SOUL.md',
    'USER.md',
    'TOOLS.md',
    'BOOTSTRAP.md',
    'HEARTBEAT.md',
  ];

  for (const file of systemFiles) {
    const templatePath = join(templatesDir, file);
    const destPath = join(workspacePath, file);
    const written = writeTemplate(templatePath, destPath, vars);
    (written ? result.generated : result.skipped).push(file);
  }

  return result;
}

// ─── Story Templates ───────────────────────────────────────────

function generateStories(
  vars: TemplateVars,
  workspacePath: string,
  templatesDir: string,
): GenerationResult {
  const result: GenerationResult = { generated: [], skipped: [] };
  const storiesTemplateDir = join(templatesDir, 'stories');
  const storiesDestDir = join(workspacePath, 'stories');

  if (!existsSync(storiesTemplateDir)) return result;

  const files = readdirSync(storiesTemplateDir)
    .filter((f) => f.endsWith('.md'))
    .sort();

  for (const file of files) {
    const templatePath = join(storiesTemplateDir, file);
    const destPath = join(storiesDestDir, file);
    const written = writeTemplate(templatePath, destPath, vars);
    (written ? result.generated : result.skipped).push(`stories/${file}`);
  }

  return result;
}

// ─── Agent Blueprint Templates ─────────────────────────────────

function generateAgentBlueprints(workspacePath: string, templatesDir: string): GenerationResult {
  const result: GenerationResult = { generated: [], skipped: [] };
  const agentsTemplateDir = join(templatesDir, 'agents');
  const agentsDestDir = join(workspacePath, 'agents');

  if (!existsSync(agentsTemplateDir)) return result;

  const agentDirs = readdirSync(agentsTemplateDir).filter((d) =>
    statSync(join(agentsTemplateDir, d)).isDirectory(),
  );

  for (const agentName of agentDirs) {
    const srcDir = join(agentsTemplateDir, agentName);
    const destDir = join(agentsDestDir, agentName);
    ensureDir(destDir);

    const files = readdirSync(srcDir).filter((f) => f.endsWith('.md'));
    for (const file of files) {
      const templatePath = join(srcDir, file);
      const destPath = join(destDir, file);
      // Agent blueprints have no dynamic vars — copy as-is
      const written = writeTemplate(templatePath, destPath);
      (written ? result.generated : result.skipped).push(`agents/${agentName}/${file}`);
    }
  }

  return result;
}

// ─── Generate .env ─────────────────────────────────────────────

export function generateEnvFile(answers: WizardAnswers): void {
  const envPath = join(process.cwd(), '.env');

  if (existsSync(envPath)) {
    // Update wizard-managed values in the existing .env (preserves user-added keys)
    updateEnvValues(envPath, answers);
    return;
  }

  const wsToken = randomBytes(32).toString('hex');
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
NEO_VERBOSITY=${answers.verbosity}

# ─── Memory ────────────────────────────────────────────────────
NEO_FADE_THRESHOLD=${answers.fadeThreshold}
NEO_DAILY_LOG_CRON=${answers.dailyLogCron}
NEO_MAX_STORIES=${answers.maxStories}

# ─── Gates ─────────────────────────────────────────────────────
NEO_GATE_PHRASE=${answers.gatePhrase}
NEO_PROTECTED_PATHS=${answers.protectedPaths.join(',')}

# ─── Router ────────────────────────────────────────────────────
NEO_ROUTING_PROFILE=${answers.routingProfile}

# ─── Telegram ──────────────────────────────────────────────────
${answers.telegramBotToken ? `TELEGRAM_BOT_TOKEN=${answers.telegramBotToken}` : '# TELEGRAM_BOT_TOKEN='}

# ─── Tailscale ─────────────────────────────────────────────────
NEO_TAILSCALE_ENABLED=${answers.tailscaleEnabled ? 'true' : 'false'}

# ─── Sync ──────────────────────────────────────────────────────
${answers.syncRepo ? `NEO_SYNC_REPO=${answers.syncRepo}` : '# NEO_SYNC_REPO='}
# NEO_SYNC_INTERVAL=30
`;

  writeFileSync(envPath, env);
  clack.log.success('.env generated');
}

/**
 * Update wizard-managed values in an existing .env file.
 * Preserves all user-added keys and comments. Only touches keys the wizard controls.
 */
function updateEnvValues(envPath: string, answers: WizardAnswers): void {
  let content = readFileSync(envPath, 'utf-8');

  // Map of wizard-managed env keys → new values from answers
  const updates: Record<string, string> = {
    NEO_PORT: String(answers.port),
    NEO_WS_PORT: String(answers.wsPort),
    NEO_PERMISSION_MODE: answers.permissionMode,
    NEO_DEFAULT_MODEL: answers.defaultModel,
    NEO_USER_NAME: answers.userName,
    NEO_AGENT_NAME: answers.agentName,
    NEO_PERSONALITY_INTENSITY: answers.personalityIntensity,
    NEO_VERBOSITY: answers.verbosity,
    NEO_FADE_THRESHOLD: String(answers.fadeThreshold),
    NEO_DAILY_LOG_CRON: answers.dailyLogCron,
    NEO_MAX_STORIES: String(answers.maxStories),
    NEO_GATE_PHRASE: answers.gatePhrase,
    NEO_PROTECTED_PATHS: answers.protectedPaths.join(','),
    NEO_ROUTING_PROFILE: answers.routingProfile,
  };

  // Also update optional keys if the wizard provided them
  if (answers.telegramBotToken) updates.TELEGRAM_BOT_TOKEN = answers.telegramBotToken;
  if (answers.syncRepo) updates.NEO_SYNC_REPO = answers.syncRepo;
  if (answers.tailscaleEnabled !== undefined)
    updates.NEO_TAILSCALE_ENABLED = answers.tailscaleEnabled ? 'true' : 'false';

  let changed = 0;
  for (const [key, value] of Object.entries(updates)) {
    // Match both active (KEY=value) and commented (# KEY=value) lines
    const regex = new RegExp(`^(#\\s*)?${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      // Key doesn't exist yet — append it
      content = content.trimEnd() + `\n${key}=${value}\n`;
    }
    changed++;
  }

  writeFileSync(envPath, content);
  clack.log.success(`.env updated (${changed} values)`);
}

// ─── Generate Workspace Files ──────────────────────────────────

export function generateWorkspaceFiles(
  answers: WizardAnswers,
  workspacePath: string,
): GenerationResult {
  ensureDirectories(workspacePath);

  const vars = buildTemplateVars(answers);
  const templatesDir = resolveTemplatesDir();

  // Generate all template groups
  const system = generateSystemTemplates(vars, workspacePath, templatesDir);
  const stories = generateStories(vars, workspacePath, templatesDir);
  const agents = generateAgentBlueprints(workspacePath, templatesDir);

  // Merge results
  const result: GenerationResult = {
    generated: [...system.generated, ...stories.generated, ...agents.generated],
    skipped: [...system.skipped, ...stories.skipped, ...agents.skipped],
  };

  clack.log.success(
    `Workspace files generated (${result.generated.length} new, ${result.skipped.length} skipped)`,
  );

  return result;
}

// ─── Generate Claude Settings ──────────────────────────────────

export function generateClaudeSettings(answers: WizardAnswers, workspacePath: string): void {
  const claudeDir = join(workspacePath, '.claude');
  ensureDir(claudeDir);

  const settings = {
    permissions: {
      allow: [
        'Read(*)',
        'Write(*)',
        'Edit(*)',
        'Bash(*)',
        'Glob(*)',
        'Grep(*)',
        'WebSearch(*)',
        'WebFetch(*)',
        'Agent(*)',
      ],
      deny: [
        'Bash(rm -rf /)',
        'Bash(rm -rf ~)',
        'Bash(sudo rm -rf *)',
        'Bash(chmod 777 /)',
        'Bash(:(){ :|:& };:)',
        'Write(~/.ssh/*)',
        'Write(~/.gnupg/*)',
        'Write(*/.env)',
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

export function initDatabase(): void {
  const db = getDb();
  closeDb();
  clack.log.success('Database initialized');
}

// ─── Resolve Templates Dir ─────────────────────────────────────

/**
 * Resolves the templates directory. Works both when running from source (tsx)
 * and when running from the built dist/ output.
 *
 * From source: __dirname = server/src/onboard → templates at server/src/onboard/templates
 * From dist:   __dirname = server/dist        → templates at server/src/onboard/templates
 */
function resolveTemplatesDir(): string {
  // Try source-relative first (works with tsx / dev mode)
  const sourceTemplates = join(__dirname, 'templates');
  if (existsSync(sourceTemplates)) return sourceTemplates;

  // Fallback: from dist/ go back to src/onboard/templates
  const distFallback = join(__dirname, '..', 'src', 'onboard', 'templates');
  if (existsSync(distFallback)) return distFallback;

  // Last resort: use the constant
  return TEMPLATES_DIR;
}
