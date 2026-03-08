import Database from 'better-sqlite3';
import { runMigrations } from './migrations.js';

let db: Database.Database;

export function getDb(dbPath?: string): Database.Database {
  if (!db) {
    const path = dbPath ?? process.env.NEO_DB_PATH ?? 'neo.db';
    db = new Database(path);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    runMigrations(db);
  }
  return db;
}

export function createMemoryDb(): Database.Database {
  const memDb = new Database(':memory:');
  memDb.pragma('foreign_keys = ON');
  runMigrations(memDb);
  return memDb;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = undefined!;
  }
}
