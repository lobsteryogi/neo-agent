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

  // Phase 7 — Agent Blueprints & Teams
  const { AgentRegistry } = await import('./agents/index.js');
  const { Orchestrator, SubAgentSpawner } = await import('./agents/index.js');
  const { ClaudeBridge } = await import('./core/claude-bridge.js');

  const agentRegistry = new AgentRegistry();
  const agentsDir = join(process.cwd(), 'workspace', 'agents');
  agentRegistry.loadFromDirectory(agentsDir);

  const bridge = new ClaudeBridge();
  const spawner = new SubAgentSpawner(bridge, '/tmp/neo-agents');
  const orchestrator = new Orchestrator(spawner, agentRegistry, db);

  app.get('/api/agents/blueprints', (_req, res) => {
    const blueprints = agentRegistry.getAll().map(({ name, description, model }) => ({
      name,
      description,
      model,
    }));
    res.json(blueprints);
  });

  app.get('/api/agents/teams', (_req, res) => {
    res.json(orchestrator.listTeams());
  });

  app.get('/api/agents/teams/:id', (req, res) => {
    const team = orchestrator.getTeam(req.params.id);
    if (!team) return res.status(404).json({ error: 'Team not found' });
    res.json(team);
  });

  app.post('/api/agents/teams', async (req, res) => {
    try {
      const { pattern, tasks } = req.body;
      const team = orchestrator.createTeam(pattern, tasks);
      const completed = await orchestrator.executeTeam(team);
      res.json(completed);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  console.log(status.ok(`Agent registry loaded (${agentRegistry.size} blueprints)`));

  console.log(status.ok('Express routes loaded'));

  // Phase 5 — Phone Lines: Channel adapters
  const WS_PORT = Number(process.env.NEO_WS_PORT) || 3142;
  const WS_TOKEN = process.env.NEO_WS_TOKEN || 'change-me-to-a-random-string';

  const { WebChannel } = await import('./channels/web.js');
  const webChannel = new WebChannel({ port: WS_PORT, token: WS_TOKEN });
  await webChannel.start();
  console.log(status.ok(`WebSocket channel listening on port ${color.matrix(String(WS_PORT))}`));

  if (process.env.TELEGRAM_BOT_TOKEN) {
    // Instantiate agent for Telegram channel
    const { NeoAgent } = await import('./core/agent.js');
    const agent = new NeoAgent(db, {
      agentName: AGENT_NAME,
      userName: USER_NAME,
      workspacePath: process.env.NEO_WORKSPACE || join(process.cwd(), 'workspace'),
      defaultModel: (process.env.NEO_DEFAULT_MODEL || 'sonnet') as 'haiku' | 'sonnet' | 'opus',
      gatePhrase: process.env.NEO_GATE_PHRASE || 'do it',
      protectedPaths: (process.env.NEO_PROTECTED_PATHS || '').split(',').filter(Boolean),
      permissionMode: process.env.NEO_PERMISSION_MODE || 'default',
      fadeThreshold: Number(process.env.NEO_FADE_THRESHOLD || '0.85'),
      port: PORT,
      wsPort: Number(process.env.NEO_WS_PORT) || 3142,
      wsToken: process.env.NEO_WS_TOKEN || 'change-me',
      dbPath: process.env.NEO_DB_PATH || join(process.cwd(), 'data', 'neo.db'),
      personalityIntensity: process.env.NEO_PERSONALITY || 'medium',
      verbosity: (process.env.NEO_VERBOSITY || 'balanced') as 'concise' | 'balanced' | 'detailed',
      dailyLogCron: process.env.NEO_DAILY_LOG_CRON || '0 23 * * *',
      maxStories: Number(process.env.NEO_MAX_STORIES || '3'),
      routingProfile: (process.env.NEO_ROUTING_PROFILE || 'balanced') as
        | 'auto'
        | 'eco'
        | 'balanced'
        | 'premium',
    });

    // Command deps — same data sources as CLI chat
    const { SessionManager } = await import('./cli/lib/sessions.js');
    const { LongTermMemory } = await import('./memory/index.js');
    const { MemorySearch } = await import('./memory/index.js');

    const tgSessionMgr = new SessionManager(db);
    const tgMemory = new LongTermMemory(db);
    const tgSearch = new MemorySearch(db);
    let tgRoutingProfile = (process.env.NEO_ROUTING_PROFILE || 'balanced') as
      | 'auto'
      | 'eco'
      | 'balanced'
      | 'premium';

    const { TelegramChannel } = await import('./channels/telegram.js');
    const tgChannel = new TelegramChannel(process.env.TELEGRAM_BOT_TOKEN, {
      sessionMgr: tgSessionMgr,
      longTermMemory: tgMemory,
      memorySearch: tgSearch,
      routingProfile: tgRoutingProfile,
      setRoutingProfile: (p) => {
        tgRoutingProfile = p;
      },
    });
    tgChannel.onMessage(async (message) => {
      return agent.handleMessage(message);
    });
    await tgChannel.start();
    console.log(status.ok('Telegram channel active'));
  }

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
