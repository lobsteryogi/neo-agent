/**
 * ░▒▓ NEO HOME MIGRATION ▓▒░
 *
 * "Everything that has a beginning has an end."
 *
 * One-time migration from old layout (./data/, ./workspace/) to
 * the centralized ~/.neo-agent/ structure.
 *
 * Runs automatically on server startup. Safe to call multiple times —
 * skips if already migrated.
 */

import { copyFileSync, existsSync, readdirSync, statSync, cpSync } from 'fs';
import { join } from 'path';
import { NeoHome } from './neo-home.js';
import { ensureDir } from '../utils/fs.js';
import { logger } from '../utils/logger.js';

const log = logger('migration');

// ─── Types ───────────────────────────────────────────────────

export interface MigrationItem {
  label: string;
  from: string;
  to: string;
  status: 'copied' | 'skipped' | 'not-found';
}

export interface MigrationReport {
  items: MigrationItem[];
  alreadyMigrated: boolean;
}

// ─── Discovery ───────────────────────────────────────────────

/** Scan for old layout files and report what would be migrated. */
export function scanOldLayout(): MigrationItem[] {
  const items: MigrationItem[] = [];

  // DB
  for (const [label, oldPath] of [
    ['neo.db', join(process.cwd(), 'data', 'neo.db')],
    ['neo.db', join(process.cwd(), 'neo.db')],
  ] as const) {
    if (existsSync(oldPath)) {
      items.push({ label, from: oldPath, to: NeoHome.db, status: 'not-found' });
      break;
    }
  }

  // .env
  for (const [label, oldPath] of [
    ['.env', join(process.cwd(), 'data', '.env')],
    ['.env', join(process.cwd(), '.env')],
  ] as const) {
    if (existsSync(oldPath)) {
      items.push({ label, from: oldPath, to: NeoHome.configEnv, status: 'not-found' });
      break;
    }
  }

  // Workspace files
  const oldWorkspace = join(process.cwd(), 'workspace');
  if (existsSync(oldWorkspace)) {
    const sharedFiles = [
      'SOUL.md',
      'USER.md',
      'AGENTS.md',
      'TOOLS.md',
      'BOOTSTRAP.md',
      'HEARTBEAT.md',
    ];
    for (const file of sharedFiles) {
      const src = join(oldWorkspace, file);
      if (existsSync(src)) {
        items.push({ label: file, from: src, to: join(NeoHome.shared, file), status: 'not-found' });
      }
    }

    // Shared directories
    for (const dir of ['skills', 'agents', 'stories']) {
      const src = join(oldWorkspace, dir);
      if (existsSync(src) && statSync(src).isDirectory()) {
        items.push({
          label: `${dir}/`,
          from: src,
          to: join(NeoHome.shared, dir),
          status: 'not-found',
        });
      }
    }

    // .claude
    const oldClaude = join(oldWorkspace, '.claude');
    if (existsSync(oldClaude) && statSync(oldClaude).isDirectory()) {
      items.push({
        label: '.claude/',
        from: oldClaude,
        to: join(NeoHome.shared, '.claude'),
        status: 'not-found',
      });
    }
  }

  // Backups
  const oldBackups = join(process.cwd(), 'data', 'backups');
  if (existsSync(oldBackups) && statSync(oldBackups).isDirectory()) {
    items.push({ label: 'backups/', from: oldBackups, to: NeoHome.backups, status: 'not-found' });
  }

  return items;
}

// ─── Execute Migration ───────────────────────────────────────

/** Run the migration. Returns a report of what was done. */
export function runMigration(opts: { force?: boolean } = {}): MigrationReport {
  const alreadyMigrated = existsSync(NeoHome.db);

  if (alreadyMigrated && !opts.force) {
    return { items: [], alreadyMigrated: true };
  }

  NeoHome.ensureStructure();

  const items = scanOldLayout();

  for (const item of items) {
    if (existsSync(item.to) && !opts.force) {
      item.status = 'skipped';
      continue;
    }

    try {
      const srcStat = statSync(item.from);
      if (srcStat.isDirectory()) {
        copyDirContents(item.from, item.to);
      } else {
        ensureDir(join(item.to, '..').replace(/\/\.\.$/, ''));
        copyFileSync(item.from, item.to);
        // DB: also copy WAL/SHM
        if (item.label === 'neo.db') {
          for (const suffix of ['-wal', '-shm']) {
            if (existsSync(item.from + suffix)) {
              copyFileSync(item.from + suffix, item.to + suffix);
            }
          }
        }
      }
      item.status = 'copied';
      log.info(`Migrated ${item.label}`, { from: item.from, to: item.to });
    } catch {
      item.status = 'skipped';
    }
  }

  const copied = items.filter((i) => i.status === 'copied').length;
  if (copied > 0) {
    log.info('Migration complete', { copied, total: items.length });
  }

  return { items, alreadyMigrated: false };
}

/**
 * Auto-migration for server startup — silent, skips if already migrated.
 */
export function migrateToNeoHome(): void {
  runMigration();
}

// ─── Helpers ─────────────────────────────────────────────────

function copyDirContents(src: string, dest: string): void {
  ensureDir(dest);
  try {
    cpSync(src, dest, { recursive: true, force: false });
  } catch {
    try {
      const entries = readdirSync(src, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = join(src, entry.name);
        const destPath = join(dest, entry.name);
        if (existsSync(destPath)) continue;
        if (entry.isDirectory()) {
          copyDirContents(srcPath, destPath);
        } else {
          copyFileSync(srcPath, destPath);
        }
      }
    } catch {
      // Best effort
    }
  }
}
