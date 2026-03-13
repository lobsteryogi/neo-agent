/**
 * ░▒▓ NEO HOME ▓▒░
 *
 * "There's a difference between knowing the path and walking the path."
 *
 * Centralized path resolver for all Neo-Agent files.
 * Every module imports paths from here instead of computing its own.
 *
 * Structure:
 *   ~/.neo-agent/
 *   ├── config.env
 *   ├── neo.db
 *   ├── logs/neo.log
 *   ├── backups/
 *   ├── workspaces/{cli,tg-dm-*,tg-group-*,web-*}/
 *   ├── shared/{skills,agents,stories,SOUL.md,...,.claude/settings.json}
 *   └── tmp/neo-agents/
 */

import type { Channel } from '@neo-agent/shared';
import { existsSync, mkdirSync, symlinkSync, lstatSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// ─── Root ────────────────────────────────────────────────────

const NEO_HOME = process.env.NEO_HOME || join(homedir(), '.neo-agent');

// ─── Static Paths ────────────────────────────────────────────

export const NeoHome = {
  /** Root: ~/.neo-agent */
  root: NEO_HOME,

  /** SQLite database */
  db: join(NEO_HOME, 'neo.db'),

  /** Main config (replaces ./data/.env and ./.env) */
  configEnv: join(NEO_HOME, 'config.env'),

  /** Log directory */
  logs: join(NEO_HOME, 'logs'),

  /** Log file */
  logFile: join(NEO_HOME, 'logs', 'neo.log'),

  /** DB backup directory */
  backups: join(NEO_HOME, 'backups'),

  /** Shared assets root (skills, agents, stories, identity .md files) */
  shared: join(NEO_HOME, 'shared'),

  /** Shared skills directory */
  skills: join(NEO_HOME, 'shared', 'skills'),

  /** Shared agent blueprints */
  agents: join(NEO_HOME, 'shared', 'agents'),

  /** Shared stories */
  stories: join(NEO_HOME, 'shared', 'stories'),

  /** Workspaces root */
  workspaces: join(NEO_HOME, 'workspaces'),

  /** Ephemeral sub-agent workspaces */
  tmpAgents: join(NEO_HOME, 'tmp', 'neo-agents'),

  /** Global Claude skills (~/.claude/skills) — not under NEO_HOME */
  claudeSkills: join(homedir(), '.claude', 'skills'),

  /**
   * Resolve a per-context workspace path.
   *
   * Examples:
   *   workspace('cli', 'cli')                   → ~/.neo-agent/workspaces/cli/
   *   workspace('telegram', '12345')             → ~/.neo-agent/workspaces/tg-dm-12345/
   *   workspace('telegram', 'group:-100999')     → ~/.neo-agent/workspaces/tg-group--100999/
   *   workspace('web', 'abc123')                 → ~/.neo-agent/workspaces/web-abc123/
   */
  workspace(channel: Channel, contextId: string): string {
    const key = deriveWorkspaceKey(channel, contextId);
    const dir = join(NEO_HOME, 'workspaces', key);
    initWorkspace(dir);
    return dir;
  },

  /**
   * Create the full ~/.neo-agent directory structure.
   * Safe to call multiple times — only creates what's missing.
   */
  ensureStructure(): void {
    const dirs = [
      NEO_HOME,
      join(NEO_HOME, 'logs'),
      join(NEO_HOME, 'backups'),
      join(NEO_HOME, 'shared'),
      join(NEO_HOME, 'shared', 'skills'),
      join(NEO_HOME, 'shared', 'agents'),
      join(NEO_HOME, 'shared', 'stories'),
      join(NEO_HOME, 'shared', '.claude'),
      join(NEO_HOME, 'workspaces'),
      join(NEO_HOME, 'tmp', 'neo-agents'),
    ];
    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  },
} as const;

// ─── Workspace Key Derivation ────────────────────────────────

function deriveWorkspaceKey(channel: Channel, contextId: string): string {
  switch (channel) {
    case 'cli':
      return 'cli';
    case 'telegram':
      // Groups: contextId starts with "group:" prefix
      if (contextId.startsWith('group:')) {
        return `tg-group-${contextId.slice(6)}`;
      }
      return `tg-dm-${contextId}`;
    case 'web':
      return `web-${contextId}`;
    default:
      return `unknown-${contextId}`;
  }
}

// ─── Workspace Init ──────────────────────────────────────────

/** Track workspaces we've already initialized this process */
const initializedWorkspaces = new Set<string>();

/**
 * Initialize a workspace directory:
 * 1. Create the dir if needed
 * 2. Symlink shared assets (skills/, agents/, stories/) if not present
 * 3. Ensure .claude/settings.json symlink exists
 */
function initWorkspace(dir: string): void {
  if (initializedWorkspaces.has(dir)) return;

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Symlink shared directories into the workspace
  const sharedLinks: [string, string][] = [
    [join(NeoHome.shared, 'skills'), join(dir, 'skills')],
    [join(NeoHome.shared, 'agents'), join(dir, 'agents')],
    [join(NeoHome.shared, 'stories'), join(dir, 'stories')],
  ];

  for (const [target, link] of sharedLinks) {
    ensureSymlink(target, link);
  }

  // Symlink .claude directory
  const claudeTarget = join(NeoHome.shared, '.claude');
  const claudeLink = join(dir, '.claude');
  ensureSymlink(claudeTarget, claudeLink);

  // Symlink shared markdown files (SOUL.md, USER.md, AGENTS.md, etc.)
  const sharedFiles = [
    'SOUL.md',
    'USER.md',
    'AGENTS.md',
    'TOOLS.md',
    'BOOTSTRAP.md',
    'HEARTBEAT.md',
  ];
  for (const file of sharedFiles) {
    const target = join(NeoHome.shared, file);
    const link = join(dir, file);
    if (existsSync(target)) {
      ensureSymlink(target, link);
    }
  }

  initializedWorkspaces.add(dir);
}

function ensureSymlink(target: string, link: string): void {
  if (existsSync(link) || isSymlink(link)) return;
  if (!existsSync(target)) return;
  try {
    symlinkSync(target, link);
  } catch {
    // Race condition or permissions — skip silently
  }
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}
