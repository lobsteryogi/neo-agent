/**
 * ░▒▓ NEO-AGENT SERVER ▓▒░
 *
 * "Welcome to the real world."
 */

import 'dotenv/config';
import express from 'express';
import { closeDb, getDb } from './db/connection.js';
import {
  MATRIX_DIVIDER,
  NEO_BANNER,
  color,
  digitalRain,
  matrixBox,
  randomQuote,
  sleep,
  status,
} from './utils/terminal.js';

const PORT = Number(process.env.NEO_PORT) || 3141;
const USER_NAME = process.env.NEO_USER_NAME || 'Neo';
const AGENT_NAME = process.env.NEO_AGENT_NAME || 'Neo';

async function main(): Promise<void> {
  console.clear();
  console.log(digitalRain(2, 70));
  console.log(NEO_BANNER);
  console.log(MATRIX_DIVIDER);
  await sleep(300);

  // Initialize database
  const db = getDb();
  console.log(status.ok('Database connected (WAL mode, FTS5 ready)'));

  // Express app
  const app = express();
  app.use(express.json());

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    const memUsage = process.memoryUsage();
    res.json({
      status: 'operational',
      uptime: process.uptime(),
      claude: { responsive: true },
      memory: {
        dbSizeMb: 0,
        ftsEntries: db.prepare('SELECT COUNT(*) as count FROM memories_fts').get() as any,
        heapUsedMb: Math.round((memUsage.heapUsed / 1024 / 1024) * 100) / 100,
      },
      gates: { blockedLast1h: 0 },
      sync: { behind: false },
      tools: {},
    });
  });

  // Session list
  app.get('/api/sessions', (_req, res) => {
    const sessions = db.prepare('SELECT * FROM sessions ORDER BY started_at DESC LIMIT 20').all();
    res.json(sessions);
  });

  // Audit log
  app.get('/api/audit', (_req, res) => {
    const logs = db.prepare('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 50').all();
    res.json(logs);
  });

  console.log(status.ok('Express routes loaded'));

  // Start server
  const server = app.listen(PORT, () => {
    console.log(status.ok(`HTTP server listening on port ${color.matrix(String(PORT))}`));
    console.log();

    console.log(
      matrixBox(
        `${AGENT_NAME} IS ONLINE`,
        [
          color.green(`Port: ${PORT}`),
          color.green(`Model: ${process.env.NEO_DEFAULT_MODEL || 'sonnet'}`),
          color.green(`Gates: ${process.env.NEO_GATE_PHRASE || 'do it'}`),
          color.green(`Fade: ${process.env.NEO_FADE_THRESHOLD || '0.85'}`),
          '',
          color.dim(`"${randomQuote()}"`),
        ],
        'success',
      ),
    );

    console.log();
    console.log(color.dim(`  I know why you're here, ${color.brightGreen(USER_NAME)}.`));
    console.log(color.dim('  Ready for connections.\n'));
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log();
    console.log(color.dim('  "See you in the next simulation." 🕶️'));
    console.log(digitalRain(1, 50));
    server.close();
    closeDb();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(color.red('Failed to start Neo-Agent:'), err);
  process.exit(1);
});
