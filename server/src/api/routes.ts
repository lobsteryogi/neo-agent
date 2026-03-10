/**
 * ░▒▓ API ROUTES ▓▒░
 *
 * "The only way to truly know someone is to argue with them."
 */

import type Database from 'better-sqlite3';
import type { Express } from 'express';
import { wrapRoute } from './route-handler.js';

export function registerRoutes(app: Express, db: Database.Database): void {
  // Sessions list
  app.get(
    '/api/sessions',
    wrapRoute((_req, res) => {
      const sessions = db.prepare('SELECT * FROM sessions ORDER BY started_at DESC LIMIT 20').all();
      res.json(sessions);
    }),
  );

  // Audit log
  app.get(
    '/api/audit',
    wrapRoute((_req, res) => {
      const logs = db.prepare('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 50').all();
      res.json(logs);
    }),
  );

  // Messages for a session
  app.get(
    '/api/sessions/:id/messages',
    wrapRoute((req, res) => {
      const messages = db
        .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC')
        .all(req.params.id);
      res.json(messages);
    }),
  );
}
