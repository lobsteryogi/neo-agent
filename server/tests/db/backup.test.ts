import type Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryDb } from '../../src/db/connection';
import { cleanOldBackups, runBackup } from '../../src/db/backup';

const TEST_BACKUP_DIR = '/tmp/neo-backup-test-' + process.pid;

describe('Database Backup', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createMemoryDb();
    // Clean up any previous test directory
    if (existsSync(TEST_BACKUP_DIR)) {
      rmSync(TEST_BACKUP_DIR, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    db.close();
    if (existsSync(TEST_BACKUP_DIR)) {
      rmSync(TEST_BACKUP_DIR, { recursive: true, force: true });
    }
  });

  // ─── runBackup ──────────────────────────────────────────────

  describe('runBackup', () => {
    it('creates a backup file in the specified directory', async () => {
      const dest = await runBackup(db, TEST_BACKUP_DIR);
      expect(dest).toBeTruthy();
      expect(existsSync(dest)).toBe(true);
    });

    it('backup filename starts with neo- and ends with .db', async () => {
      const dest = await runBackup(db, TEST_BACKUP_DIR);
      const filename = dest.split('/').pop()!;
      expect(filename.startsWith('neo-')).toBe(true);
      expect(filename.endsWith('.db')).toBe(true);
    });

    it('backup filename contains an ISO-like timestamp', async () => {
      const dest = await runBackup(db, TEST_BACKUP_DIR);
      const filename = dest.split('/').pop()!;
      // Timestamp has format like 2026-03-12T... with colons/dots replaced by dashes
      const timestampPart = filename.replace('neo-', '').replace('.db', '');
      expect(timestampPart.length).toBeGreaterThan(10);
      expect(timestampPart).toMatch(/^\d{4}-\d{2}-\d{2}/);
    });

    it('creates the backup directory if it does not exist', async () => {
      const nestedDir = join(TEST_BACKUP_DIR, 'deep', 'nested');
      const dest = await runBackup(db, nestedDir);
      expect(existsSync(nestedDir)).toBe(true);
      expect(existsSync(dest)).toBe(true);
    });

    it('produces a valid SQLite database file', async () => {
      // Insert some data to verify
      db.prepare(
        "INSERT INTO sessions (id, channel, user_id, model, status, started_at, total_tokens) VALUES ('s1', 'cli', 'u1', 'sonnet', 'active', ?, 0)",
      ).run(Date.now());

      const dest = await runBackup(db, TEST_BACKUP_DIR);

      // Open the backup and verify data
      const BetterSqlite3 = (await import('better-sqlite3')).default;
      const backupDb = new BetterSqlite3(dest);
      const sessions = backupDb.prepare('SELECT * FROM sessions').all();
      expect(sessions).toHaveLength(1);
      backupDb.close();
    });

    it('creates multiple backups with unique names', async () => {
      await runBackup(db, TEST_BACKUP_DIR);
      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10));
      await runBackup(db, TEST_BACKUP_DIR);

      const files = readdirSync(TEST_BACKUP_DIR).filter((f) => f.endsWith('.db'));
      expect(files.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── cleanOldBackups ────────────────────────────────────────

  describe('cleanOldBackups', () => {
    it('keeps only the specified number of most recent backups', () => {
      mkdirSync(TEST_BACKUP_DIR, { recursive: true });

      // Create 5 fake backup files with sorted names
      for (let i = 1; i <= 5; i++) {
        writeFileSync(join(TEST_BACKUP_DIR, `neo-2026-01-0${i}.db`), '');
      }

      cleanOldBackups(TEST_BACKUP_DIR, 2);

      const remaining = readdirSync(TEST_BACKUP_DIR).filter(
        (f) => f.startsWith('neo-') && f.endsWith('.db'),
      );
      expect(remaining).toHaveLength(2);
      // Should keep the 2 most recent (highest sorted names)
      expect(remaining).toContain('neo-2026-01-05.db');
      expect(remaining).toContain('neo-2026-01-04.db');
    });

    it('does nothing when fewer files than the keep threshold', () => {
      mkdirSync(TEST_BACKUP_DIR, { recursive: true });
      writeFileSync(join(TEST_BACKUP_DIR, 'neo-2026-01-01.db'), '');
      writeFileSync(join(TEST_BACKUP_DIR, 'neo-2026-01-02.db'), '');

      cleanOldBackups(TEST_BACKUP_DIR, 5);

      const remaining = readdirSync(TEST_BACKUP_DIR).filter(
        (f) => f.startsWith('neo-') && f.endsWith('.db'),
      );
      expect(remaining).toHaveLength(2);
    });

    it('does not delete non-backup files', () => {
      mkdirSync(TEST_BACKUP_DIR, { recursive: true });
      writeFileSync(join(TEST_BACKUP_DIR, 'neo-2026-01-01.db'), '');
      writeFileSync(join(TEST_BACKUP_DIR, 'other-file.txt'), '');
      writeFileSync(join(TEST_BACKUP_DIR, 'important.db'), '');

      cleanOldBackups(TEST_BACKUP_DIR, 0);

      const remaining = readdirSync(TEST_BACKUP_DIR);
      expect(remaining).toContain('other-file.txt');
      expect(remaining).toContain('important.db');
      expect(remaining).not.toContain('neo-2026-01-01.db');
    });

    it('does not throw when the backup directory does not exist', () => {
      expect(() => cleanOldBackups('/tmp/nonexistent-backup-dir-xyz', 5)).not.toThrow();
    });

    it('handles keep=0 by removing all backup files', () => {
      mkdirSync(TEST_BACKUP_DIR, { recursive: true });
      for (let i = 1; i <= 3; i++) {
        writeFileSync(join(TEST_BACKUP_DIR, `neo-2026-01-0${i}.db`), '');
      }

      cleanOldBackups(TEST_BACKUP_DIR, 0);

      const remaining = readdirSync(TEST_BACKUP_DIR).filter(
        (f) => f.startsWith('neo-') && f.endsWith('.db'),
      );
      expect(remaining).toHaveLength(0);
    });

    it('handles exactly the keep threshold (no deletions)', () => {
      mkdirSync(TEST_BACKUP_DIR, { recursive: true });
      for (let i = 1; i <= 3; i++) {
        writeFileSync(join(TEST_BACKUP_DIR, `neo-2026-01-0${i}.db`), '');
      }

      cleanOldBackups(TEST_BACKUP_DIR, 3);

      const remaining = readdirSync(TEST_BACKUP_DIR).filter(
        (f) => f.startsWith('neo-') && f.endsWith('.db'),
      );
      expect(remaining).toHaveLength(3);
    });
  });

  // ─── Integration: runBackup cleans old backups ───────────────

  describe('integration', () => {
    it('runBackup automatically cleans old backups (keeps 10)', async () => {
      mkdirSync(TEST_BACKUP_DIR, { recursive: true });

      // Pre-populate with 12 old backups
      for (let i = 1; i <= 12; i++) {
        const day = String(i).padStart(2, '0');
        writeFileSync(join(TEST_BACKUP_DIR, `neo-2025-01-${day}T00-00-00-000Z.db`), '');
      }

      // Run a new backup (creates a 13th file, then cleans to 10)
      await runBackup(db, TEST_BACKUP_DIR);

      const remaining = readdirSync(TEST_BACKUP_DIR).filter(
        (f) => f.startsWith('neo-') && f.endsWith('.db'),
      );
      expect(remaining.length).toBeLessThanOrEqual(10);
    });
  });
});
