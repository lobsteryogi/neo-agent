/**
 * ░▒▓ NEO-AGENT SERVER ▓▒░
 *
 * "Welcome to the real world."
 */

import 'dotenv/config';
import express from 'express';
import { join } from 'path';
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

  // Phase 3 — Tool Registry (The Armory)
  const { ToolRegistry } = await import('./tools/registry.js');
  const { BrowserTool } = await import('./tools/browser.js');
  const { SchedulerTool } = await import('./tools/scheduler.js');

  const toolRegistry = new ToolRegistry();
  toolRegistry.register(new BrowserTool());
  toolRegistry.register(new SchedulerTool());
  console.log(status.ok(`Tool registry loaded (${toolRegistry.size} tools)`));

  // Health endpoint (passes tool registry for real health checks)
  const { healthRoute } = await import('./api/health.js');
  healthRoute(app, { db, toolRegistry });

  // Core API routes (sessions, audit, messages)
  const { registerRoutes } = await import('./api/routes.js');
  registerRoutes(app, db);

  // Tool health endpoint
  app.get('/api/tools', async (_req, res) => {
    const health = await toolRegistry.healthCheckAll();
    res.json(health);
  });

  // Phase 6 — Skills
  const { SkillRegistry } = await import('./skills/index.js');
  const skillRegistry = new SkillRegistry();
  const skillsDir = join(process.cwd(), 'workspace', 'skills');
  skillRegistry.loadFromDirectory(skillsDir);

  app.get('/api/skills', (_req, res) => {
    const skills = skillRegistry.getAll().map(({ name, description, tags }) => ({
      name,
      description,
      tags,
    }));
    res.json(skills);
  });

  app.get('/api/skills/:name', (req, res) => {
    const skill = skillRegistry.get(req.params.name);
    if (!skill) return res.status(404).json({ error: 'Skill not found' });
    res.json(skill);
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
