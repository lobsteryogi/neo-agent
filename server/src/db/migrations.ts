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
  {
    version: 3,
    name: 'agent_teams',
    up: `
      CREATE TABLE IF NOT EXISTS agent_teams (
        id TEXT PRIMARY KEY,
        pattern TEXT NOT NULL CHECK(pattern IN ('sequential', 'parallel', 'supervisor')),
        agents TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK(status IN ('pending', 'running', 'completed', 'failed')),
        results TEXT,
        parent_session TEXT,
        created_at INTEGER NOT NULL,
        completed_at INTEGER,
        FOREIGN KEY (parent_session) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_agent_teams_status ON agent_teams(status);
      CREATE INDEX IF NOT EXISTS idx_agent_teams_session ON agent_teams(parent_session);

      CREATE TABLE IF NOT EXISTS agent_messages (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        from_agent TEXT NOT NULL,
        to_agent TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('finding', 'question', 'update', 'artifact')),
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (team_id) REFERENCES agent_teams(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_agent_messages_team ON agent_messages(team_id, timestamp);
    `,
  },
  {
    version: 4,
    name: 'kanban_tasks',
    up: `
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'backlog'
          CHECK(status IN ('backlog', 'in_progress', 'review', 'done')),
        priority TEXT NOT NULL DEFAULT 'medium'
          CHECK(priority IN ('low', 'medium', 'high', 'critical')),
        position REAL NOT NULL DEFAULT 0,
        labels TEXT NOT NULL DEFAULT '[]',
        session_id TEXT,
        team_id TEXT,
        created_by TEXT NOT NULL DEFAULT 'user'
          CHECK(created_by IN ('user', 'agent')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
        FOREIGN KEY (team_id) REFERENCES agent_teams(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, position);
    `,
  },
  {
    version: 5,
    name: 'session_name',
    up: `
      ALTER TABLE chat_sessions ADD COLUMN name TEXT;
    `,
  },
  {
    version: 6,
    name: 'extended_session_state',
    up: `
      ALTER TABLE sessions ADD COLUMN sdk_session_id TEXT;
      ALTER TABLE sessions ADD COLUMN last_model_tier TEXT;
      ALTER TABLE sessions ADD COLUMN turns INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sessions ADD COLUMN total_input_tokens INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sessions ADD COLUMN total_output_tokens INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sessions ADD COLUMN total_cost REAL NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 7,
    name: 'task_agent_result',
    up: `
      ALTER TABLE tasks ADD COLUMN agent_result TEXT;
    `,
  },
  {
    version: 8,
    name: 'task_status_error',
    up: `
      CREATE TABLE tasks_new (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'backlog'
          CHECK(status IN ('backlog', 'in_progress', 'review', 'done', 'error')),
        priority TEXT NOT NULL DEFAULT 'medium'
          CHECK(priority IN ('low', 'medium', 'high', 'critical')),
        position REAL NOT NULL DEFAULT 0,
        labels TEXT NOT NULL DEFAULT '[]',
        session_id TEXT,
        team_id TEXT,
        created_by TEXT NOT NULL DEFAULT 'user'
          CHECK(created_by IN ('user', 'agent')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER,
        agent_result TEXT
      );
      INSERT INTO tasks_new SELECT id, title, description, status, priority, position, labels,
        session_id, team_id, created_by, created_at, updated_at, completed_at, agent_result
        FROM tasks;
      DROP TABLE tasks;
      ALTER TABLE tasks_new RENAME TO tasks;
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, position);
    `,
  },
  {
    version: 9,
    name: 'task_extra_fields',
    up: `
      ALTER TABLE tasks ADD COLUMN model TEXT;
      ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT '';
      ALTER TABLE tasks ADD COLUMN started_at INTEGER;
    `,
  },
  {
    version: 10,
    name: 'user_profiles',
    up: `
      CREATE TABLE IF NOT EXISTS user_profiles (
        id TEXT PRIMARY KEY,
        channel TEXT NOT NULL,
        display_name TEXT,
        onboarded INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_user_profiles_channel ON user_profiles(channel);
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
      const runMigration = db.transaction(() => {
        db.exec(migration.up);
        db.prepare('INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
          migration.version,
          migration.name,
          Date.now(),
        );
      });
      runMigration();
      console.log(`  ✅ Migration ${migration.version}: ${migration.name}`);
    }
  }
}
