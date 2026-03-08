/**
 * ░▒▓ API ROUTES ▓▒░
 *
 * "The only way to truly know someone is to argue with them."
 */

import type Database from 'better-sqlite3';
import type { Express } from 'express';

export function registerRoutes(app: Express, db: Database.Database): void {
  // Sessions list
  app.get('/api/sessions', (_req, res) => {
    try {
      const sessions = db.prepare('SELECT * FROM sessions ORDER BY started_at DESC LIMIT 20').all();
      res.json(sessions);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Audit log
  app.get('/api/audit', (_req, res) => {
    try {
      const logs = db.prepare('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 50').all();
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Messages for a session
  app.get('/api/sessions/:id/messages', (req, res) => {
    try {
      const messages = db
        .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC')
        .all(req.params.id);
      res.json(messages);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
