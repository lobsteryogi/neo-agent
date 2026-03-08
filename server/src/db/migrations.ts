import type Database from 'better-sqlite3';

interface Migration {
  version: number;
  name: string;
  up: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: `
      -- Sessions
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        channel TEXT NOT NULL CHECK(channel IN ('telegram', 'web', 'cli')),
        user_id TEXT,
        model TEXT NOT NULL DEFAULT 'sonnet',
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'ended', 'faded')),
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        total_tokens INTEGER NOT NULL DEFAULT 0
      );

      -- Messages
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
        content TEXT NOT NULL,
        tokens INTEGER NOT NULL DEFAULT 0,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, timestamp);

      -- Handoffs (Red Pill Moments)
      CREATE TABLE IF NOT EXISTS handoffs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        snapshot TEXT NOT NULL,
        context_size INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      -- Daily Logs (Oracle's Journal)
      CREATE TABLE IF NOT EXISTS daily_logs (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL UNIQUE,
        summary TEXT NOT NULL,
        decisions TEXT,
        blockers TEXT,
        learnings TEXT,
        created_at INTEGER NOT NULL
      );

      -- Long-term Memories
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('fact', 'preference', 'decision', 'learning', 'correction')),
        content TEXT NOT NULL,
        importance REAL NOT NULL DEFAULT 0.5,
        tags TEXT NOT NULL DEFAULT '',
        source_session TEXT,
        created_at INTEGER NOT NULL,
        accessed_at INTEGER NOT NULL
      );

      -- FTS5 for memory search
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        content,
        tags,
        content=memories,
        content_rowid=rowid
      );

      -- Triggers to keep FTS in sync
      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags);
      END;
      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, tags) VALUES('delete', old.rowid, old.content, old.tags);
      END;
      CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, tags) VALUES('delete', old.rowid, old.content, old.tags);
        INSERT INTO memories_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags);
      END;

      -- Stories (Operational Memory files tracking)
      CREATE TABLE IF NOT EXISTS stories (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '',
        last_loaded_at INTEGER
      );

      -- Audit Log (Historian)
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        session_id TEXT,
        gate_name TEXT,
        model_used TEXT,
        tokens_used INTEGER,
        blocked INTEGER DEFAULT 0,
        details TEXT,
        response_summary TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_log(event_type);

      -- Gate Config
      CREATE TABLE IF NOT EXISTS gate_config (
        gate_name TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1,
        config TEXT NOT NULL DEFAULT '{}'
      );

      -- Sibling Locks
      CREATE TABLE IF NOT EXISTS sibling_locks (
        file_path TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        locked_at INTEGER NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: 'chat_sessions',
    up: `
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        sdk_session_id TEXT,
        turns INTEGER NOT NULL DEFAULT 0,
        total_input_tokens INTEGER NOT NULL DEFAULT 0,
        total_output_tokens INTEGER NOT NULL DEFAULT 0,
        total_cost REAL NOT NULL DEFAULT 0,
        last_model TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `,
  },
];

export function runMigrations(db: Database.Database): void {
  // Ensure _migrations table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `);

  const applied = new Set(
    db
      .prepare('SELECT version FROM _migrations')
      .all()
      .map((r: any) => r.version),
  );

  for (const migration of MIGRATIONS) {
    if (!applied.has(migration.version)) {
      db.exec(migration.up);
      db.prepare('INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        migration.version,
        migration.name,
        Date.now(),
      );
      console.log(`  ✅ Migration ${migration.version}: ${migration.name}`);
    }
  }
}
