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

/**
 * Check for old layout and migrate to ~/.neo-agent/ if needed.
 * Call this once at startup before DB init.
 */
export function migrateToNeoHome(): void {
  // Already has a DB in NeoHome — skip migration
  if (existsSync(NeoHome.db)) return;

  NeoHome.ensureStructure();

  let migrated = false;

  // ─── DB Migration ────────────────────────────────────────
  const oldDbPaths = [join(process.cwd(), 'data', 'neo.db'), join(process.cwd(), 'neo.db')];
  for (const oldDb of oldDbPaths) {
    if (existsSync(oldDb)) {
      copyFileSync(oldDb, NeoHome.db);
      // Also copy WAL/SHM if they exist
      for (const suffix of ['-wal', '-shm']) {
        if (existsSync(oldDb + suffix)) {
          copyFileSync(oldDb + suffix, NeoHome.db + suffix);
        }
      }
      log.info('Migrated database', { from: oldDb, to: NeoHome.db });
      migrated = true;
      break;
    }
  }

  // ─── Config Migration ────────────────────────────────────
  const oldEnvPaths = [join(process.cwd(), 'data', '.env'), join(process.cwd(), '.env')];
  for (const oldEnv of oldEnvPaths) {
    if (existsSync(oldEnv) && !existsSync(NeoHome.configEnv)) {
      copyFileSync(oldEnv, NeoHome.configEnv);
      log.info('Migrated config', { from: oldEnv, to: NeoHome.configEnv });
      migrated = true;
      break;
    }
  }

  // ─── Workspace → shared + workspaces/cli ─────────────────
  const oldWorkspace = join(process.cwd(), 'workspace');
  if (existsSync(oldWorkspace)) {
    // Shared files go to ~/.neo-agent/shared/
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
      const dest = join(NeoHome.shared, file);
      if (existsSync(src) && !existsSync(dest)) {
        copyFileSync(src, dest);
      }
    }

    // Shared directories go to ~/.neo-agent/shared/
    const sharedDirs = ['skills', 'agents', 'stories'];
    for (const dir of sharedDirs) {
      const src = join(oldWorkspace, dir);
      const dest = join(NeoHome.shared, dir);
      if (existsSync(src) && statSync(src).isDirectory()) {
        copyDirContents(src, dest);
      }
    }

    // .claude directory
    const oldClaude = join(oldWorkspace, '.claude');
    const newClaude = join(NeoHome.shared, '.claude');
    if (existsSync(oldClaude) && statSync(oldClaude).isDirectory()) {
      copyDirContents(oldClaude, newClaude);
    }

    log.info('Migrated workspace to shared', { from: oldWorkspace, to: NeoHome.shared });
    migrated = true;
  }

  // ─── Backups ─────────────────────────────────────────────
  const oldBackups = join(process.cwd(), 'data', 'backups');
  if (existsSync(oldBackups) && statSync(oldBackups).isDirectory()) {
    copyDirContents(oldBackups, NeoHome.backups);
    log.info('Migrated backups', { from: oldBackups, to: NeoHome.backups });
    migrated = true;
  }

  if (migrated) {
    log.info('Migration complete — files now live in ~/.neo-agent/');
  }
}

function copyDirContents(src: string, dest: string): void {
  ensureDir(dest);
  try {
    cpSync(src, dest, { recursive: true, force: false });
  } catch {
    // cpSync with force:false won't overwrite — errors on existing files are expected
    // Fall back to manual copy for older Node versions
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
