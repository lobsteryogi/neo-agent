import Database from 'better-sqlite3';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { healthRoute, type HealthConfig } from '../../src/api/health';

// Mini test helper — no need for supertest, just use node fetch
function createTestApp(config: HealthConfig): express.Express {
  const app = express();
  healthRoute(app, config);
  return app;
}

async function requestHealth(app: express.Express): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address() as any;
      fetch(`http://localhost:${addr.port}/api/health`)
        .then(async (res) => {
          const body = await res.json();
          server.close();
          resolve({ status: res.status, body });
        })
        .catch((err) => {
          server.close();
          resolve({ status: 500, body: { error: err.message } });
        });
    });
  });
}

describe('Health Endpoint', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS memories_fts (content TEXT);
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        action TEXT,
        details TEXT,
        timestamp INTEGER
      );
    `);
  });

  afterEach(() => {
    db.close();
  });

  it('GET /api/health returns 200 when operational', async () => {
    const app = createTestApp({ db });
    const res = await requestHealth(app);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('operational');
  });

  it('includes claude responsiveness', async () => {
    const app = createTestApp({ db });
    const res = await requestHealth(app);
    expect(res.body.claude).toHaveProperty('responsive');
  });

  it('includes memory DB stats', async () => {
    const app = createTestApp({ db });
    const res = await requestHealth(app);
    expect(res.body.memory).toHaveProperty('dbSizeMb');
    expect(res.body.memory).toHaveProperty('ftsEntries');
  });

  it('includes tool health status', async () => {
    const app = createTestApp({ db });
    const res = await requestHealth(app);
    expect(res.body.tools).toBeDefined();
  });

  it('returns 503 when system is down', async () => {
    const app = createTestApp({ db, forceDown: true });
    const res = await requestHealth(app);
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('down');
  });
});
