/**
 * ░▒▓ SQLITE BACKUP ▓▒░
 *
 * "Save yourself before the Matrix resets."
 *
 * Scheduled database backups with automatic cleanup.
 */

import type Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';

const log = logger('backup');

export function runBackup(db: Database.Database, backupDir: string): Promise<string> {
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = join(backupDir, `neo-${timestamp}.db`);

  return db.backup(dest).then(() => {
    cleanOldBackups(backupDir, 10);
    return dest;
  });
}

export function cleanOldBackups(backupDir: string, keep: number): void {
  if (!existsSync(backupDir)) return;

  const files = readdirSync(backupDir)
    .filter((f) => f.startsWith('neo-') && f.endsWith('.db'))
    .sort()
    .reverse();

  // Keep only the most recent N
  for (const file of files.slice(keep)) {
    try {
      unlinkSync(join(backupDir, file));
    } catch (err) {
      log.warn('Failed to clean old backup', { file, error: String(err) });
    }
  }
}
