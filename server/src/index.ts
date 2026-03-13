/**
 * ░▒▓ NEO-AGENT SERVER ▓▒░
 *
 * "Welcome to the real world."
 */

import 'dotenv/config';
import express from 'express';
import { join } from 'path';
import { closeDb, getDb } from './db/connection.js';
import { getErrorMessage } from './utils/errors.js';
import { startLogRelay } from './utils/log-relay.js';
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
const USER_NAME = process.env.NEO_USER_NAME || 'Human';
const AGENT_NAME = process.env.NEO_AGENT_NAME || 'Neo';

async function main(): Promise<void> {
  console.clear();
  console.log(digitalRain(2, 70));
  console.log(NEO_BANNER);
  console.log(MATRIX_DIVIDER);
  await sleep(300);

  // Start log relay — receives logs from remote processes (chat CLI, etc.)
  startLogRelay();

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
  const { TailscaleTool } = await import('./tools/tailscale.js');

  const toolRegistry = new ToolRegistry();
  toolRegistry.register(new BrowserTool());
  toolRegistry.register(new SchedulerTool());
  toolRegistry.register(new TailscaleTool());
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

  // Phase 6 — Skills (registry loaded here; routes registered after bridge is ready)
  const { SkillRegistry } = await import('./skills/index.js');
  const skillRegistry = new SkillRegistry();
  const skillsDir = join(process.cwd(), 'workspace', 'skills');
  skillRegistry.loadFromDirectory(skillsDir);
  // Also load global Claude Code skills from ~/.claude/skills/
  const claudeSkillsDir = join(process.env.HOME ?? '/root', '.claude', 'skills');
  skillRegistry.loadFromDirectory(claudeSkillsDir);

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

  // Skills routes (needs bridge for AI generation)
  const { registerSkillRoutes } = await import('./api/skills-routes.js');
  registerSkillRoutes(app, skillRegistry, skillsDir, bridge);
  console.log(status.ok(`Skills loaded (${skillRegistry.size} skills)`));

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
      res.status(500).json({ error: getErrorMessage(err) });
    }
  });

  console.log(status.ok(`Agent registry loaded (${agentRegistry.size} blueprints)`));

  // Phase 8 — Kanban Task Board
  const { registerTaskRoutes } = await import('./api/task-routes.js');
  const { TaskRepo } = await import('./db/task-repo.js');
  const { TaskRunner } = await import('./core/task-runner.js');
  // Broadcast wired after WebChannel starts (below)
  const taskRepo = new TaskRepo(db);
  const taskRoutesBinder = (broadcast: (event: { type: string; [key: string]: unknown }) => void) =>
    registerTaskRoutes(app, db, broadcast);

  console.log(status.ok('Express routes loaded'));

  // Phase 5 — Phone Lines: Channel adapters
  const WS_PORT = Number(process.env.NEO_WS_PORT) || 3142;
  const WS_TOKEN = process.env.NEO_WS_TOKEN || 'change-me-to-a-random-string';

  const { WebChannel } = await import('./channels/web.js');
  const webChannel = new WebChannel({ port: WS_PORT, token: WS_TOKEN });
  await webChannel.start();
  const broadcast = webChannel.broadcast.bind(webChannel);
  taskRoutesBinder(broadcast);
  console.log(status.ok(`WebSocket channel listening on port ${color.matrix(String(WS_PORT))}`));

  // Cron routes (uses SchedulerTool + ClaudeBridge + broadcast)
  const { registerCronRoutes } = await import('./api/cron-routes.js');
  const schedulerTool = toolRegistry.get('cron') as InstanceType<typeof SchedulerTool>;
  registerCronRoutes(app, schedulerTool, broadcast, bridge);
  console.log(status.ok('Cron routes loaded'));

  // Phase 8b — Task Runner: auto-picks up backlog tasks and runs agents
  const taskRunner = new TaskRunner(taskRepo, broadcast, {
    pollIntervalMs: 5000,
    maxConcurrent: 2,
    workspaceDir: process.env.NEO_WORKSPACE_PATH
      ? join(process.cwd(), process.env.NEO_WORKSPACE_PATH)
      : join(process.cwd(), 'workspace'),
    model: process.env.NEO_DEFAULT_MODEL || 'sonnet',
  });
  taskRunner.start();
  console.log(status.ok('Task runner active (polling backlog every 5s)'));

  if (process.env.TELEGRAM_BOT_TOKEN) {
    // Instantiate agent for Telegram channel
    const { NeoAgent } = await import('./core/agent.js');
    const agent = new NeoAgent(db, {
      agentName: AGENT_NAME,
      userName: USER_NAME,
      workspacePath: process.env.NEO_WORKSPACE_PATH || './workspace',
      defaultModel: (process.env.NEO_DEFAULT_MODEL || 'sonnet') as 'haiku' | 'sonnet' | 'opus',
      gatePhrase: process.env.NEO_GATE_PHRASE || 'do it',
      protectedPaths: (process.env.NEO_PROTECTED_PATHS || '~/.ssh/,~/.gnupg/,.env')
        .split(',')
        .filter(Boolean),
      permissionMode: process.env.NEO_PERMISSION_MODE || 'default',
      fadeThreshold: Number(process.env.NEO_FADE_THRESHOLD || '0.85'),
      port: PORT,
      wsPort: Number(process.env.NEO_WS_PORT) || 3142,
      wsToken: process.env.NEO_WS_TOKEN || 'change-me',
      dbPath: process.env.NEO_DB_PATH || join(process.cwd(), 'data', 'neo.db'),
      personalityIntensity: process.env.NEO_PERSONALITY_INTENSITY || 'full-existential-crisis',
      verbosity: (process.env.NEO_VERBOSITY || 'balanced') as 'concise' | 'balanced' | 'detailed',
      dailyLogCron: process.env.NEO_DAILY_LOG_CRON || '0 23 * * *',
      maxStories: Number(process.env.NEO_MAX_STORIES || '5'),
      routingProfile: (process.env.NEO_ROUTING_PROFILE || 'auto') as
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
    let tgRoutingProfile = (process.env.NEO_ROUTING_PROFILE || 'auto') as
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
      transcript: agent.getTranscript(),
      setModelOverride: (key, model) => agent.setModelOverride(key, model),
      getLastInput: (key) => agent.getLastInput(key),
      retryLastInput: async (sessionKey, userId, ctx) => {
        // Construct the same userKey that the agent uses internally
        const userKey = userId ? `${sessionKey}:${userId}` : sessionKey;
        const lastInput = agent.getLastInput(userKey);
        if (!lastInput) return;
        const chatId = sessionKey.replace('telegram:', '');
        const response = await agent.handleMessage({
          id: `retry-${Date.now()}`,
          channelId: chatId,
          channel: 'telegram',
          userId,
          content: lastInput,
          timestamp: Date.now(),
          sessionKey,
        });
        if (response) {
          const startMs = Date.now();
          (tgChannel as any).sendResponse(ctx, response, startMs);
        }
      },
      taskRepo: new (await import('./db/task-repo.js')).TaskRepo(db),
      setNeoDevMode: (key: string, on: boolean) => agent.setNeoDevMode(key, on),
      isNeoDevMode: (key: string) => agent.isNeoDevMode(key),
      observeGroupMessage: (message) => agent.observeGroupMessage(message),
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
  const shutdown = async () => {
    console.log();
    console.log(color.dim('  "See you in the next simulation." 🕶️'));
    console.log(digitalRain(1, 50));
    taskRunner.stop();
    server.close();
    try {
      const { runBackup } = await import('./db/backup.js');
      const backupDir = join(process.cwd(), 'data', 'backups');
      const dest = await runBackup(db, backupDir);
      console.log(status.ok(`Backup saved: ${dest}`));
    } catch {
      // Don't block shutdown on backup failure
    }
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
