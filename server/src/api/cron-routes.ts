/**
 * ░▒▓ CRON ROUTES ▓▒░
 *
 * "There's a difference between knowing the path and walking the path."
 *
 * REST endpoints for scheduled cron job management.
 * Jobs are executed via the SchedulerTool and run shell commands.
 * Natural language → cron generation powered by ClaudeBridge.
 * Metadata is in-memory — jobs reset on server restart.
 */

import { exec } from 'child_process';
import type { Express } from 'express';
import type { ClaudeBridge } from '../core/claude-bridge.js';
import { NeoHome } from '../core/neo-home.js';
import type { SchedulerTool } from '../tools/scheduler.js';
import { stripMarkdownFences } from '../utils/strip-fences.js';
import { logger } from '../utils/logger.js';
import { wrapRoute } from './route-handler.js';

const log = logger('cron-routes');

// ─── AI System Prompt ─────────────────────────────────────────

const GENERATE_SYSTEM_PROMPT = `You generate cron job definitions from natural language descriptions.
Respond ONLY with a valid JSON object — no markdown fences, no explanation, no extra text before or after.

JSON schema:
{
  "name": "kebab-case-identifier",
  "expression": "* * * * *",
  "command": "shell command",
  "description": "One sentence: what it does and how often."
}

Rules:
- name: lowercase, hyphens only, max 40 chars, descriptive
- expression: standard 5-field cron (minute hour day-of-month month day-of-week)
- command: a real, safe shell command using common Unix tools
- description: plain English, mention the schedule (e.g. "every 5 minutes", "daily at 3am")

Examples:
User: "ping the health endpoint every 5 minutes"
{"name":"health-ping","expression":"*/5 * * * *","command":"curl -s http://localhost:3141/api/health","description":"Pings the local API health endpoint every 5 minutes."}

User: "clean temp files daily at 3am"
{"name":"clean-tmp","expression":"0 3 * * *","command":"find /tmp -type f -mtime +1 -delete","description":"Deletes temp files older than 1 day, runs daily at 3am."}`;

// ─── In-Memory Metadata ────────────────────────────────────────

export interface CronJob {
  name: string;
  expression: string;
  command: string;
  description?: string;
  createdAt: number;
  lastRunAt?: number;
  runCount: number;
}

const cronMeta = new Map<string, CronJob>();

// ─── Helpers ──────────────────────────────────────────────────

function makeCronFn(
  job: CronJob,
  broadcast: (event: { type: string; [key: string]: unknown }) => void,
) {
  return () => {
    log.info('cron fired', { name: job.name, command: job.command });
    job.lastRunAt = Date.now();
    job.runCount++;
    broadcast({ type: 'cron:fired', job: { ...job } });

    exec(job.command, { cwd: NeoHome.root, timeout: 30_000 }, (err, stdout, stderr) => {
      const output = (stdout || stderr || '').trim();
      if (err) {
        log.warn('cron command failed', { name: job.name, error: err.message });
        broadcast({ type: 'cron:error', name: job.name, error: err.message, output });
      } else {
        log.debug('cron command ok', { name: job.name, output: output.slice(0, 200) });
        broadcast({ type: 'cron:done', name: job.name, output: output.slice(0, 500) });
      }
    });
  };
}

// ─── Route Registration ────────────────────────────────────────

export function registerCronRoutes(
  app: Express,
  scheduler: SchedulerTool,
  broadcast: (event: { type: string; [key: string]: unknown }) => void,
  bridge: ClaudeBridge,
): void {
  // ─── Generate from natural language prompt ────────────────────
  app.post(
    '/api/crons/generate',
    wrapRoute(async (req, res) => {
      const { prompt } = req.body as { prompt?: string };
      if (!prompt?.trim()) return res.status(400).json({ error: 'prompt is required' });

      log.info('generating cron from prompt', { prompt: prompt.slice(0, 100) });

      const result = await bridge.run(`Generate a cron job for: ${prompt}`, {
        cwd: NeoHome.workspace('cli', 'cli'),
        model: 'haiku',
        maxTurns: 1,
        allowedTools: [],
        systemPrompt: GENERATE_SYSTEM_PROMPT,
        timeoutMs: 30_000,
        permissionMode: 'default',
      });

      if (!result.success) {
        return res.status(500).json({ error: result.message || 'Generation failed' });
      }

      const raw = ((result.data as any)?.content as string) ?? '';
      const jsonStr = stripMarkdownFences(raw);

      let parsed: { name: string; expression: string; command: string; description?: string };
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        log.warn('cron generate: JSON parse failed', { raw: raw.slice(0, 300) });
        return res
          .status(500)
          .json({ error: 'Model returned invalid JSON', raw: raw.slice(0, 500) });
      }

      if (!parsed.name || !parsed.expression || !parsed.command) {
        return res.status(500).json({ error: 'Model response missing required fields', parsed });
      }

      log.info('cron generated', { name: parsed.name, expression: parsed.expression });
      res.json(parsed);
    }),
  );

  // ─── List all cron jobs ──────────────────────────────────────
  app.get(
    '/api/crons',
    wrapRoute((_req, res) => {
      res.json([...cronMeta.values()]);
    }),
  );

  // ─── Create cron job ─────────────────────────────────────────
  app.post(
    '/api/crons',
    wrapRoute((req, res) => {
      const { name, expression, command, description } = req.body as {
        name?: string;
        expression?: string;
        command?: string;
        description?: string;
      };

      if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
      if (!expression?.trim()) return res.status(400).json({ error: 'expression is required' });
      if (!command?.trim()) return res.status(400).json({ error: 'command is required' });

      if (cronMeta.has(name)) {
        return res.status(409).json({ error: `Cron job "${name}" already exists` });
      }

      const job: CronJob = {
        name,
        expression,
        command,
        description: description || undefined,
        createdAt: Date.now(),
        runCount: 0,
      };

      const ok = scheduler.schedule(name, expression, makeCronFn(job, broadcast));
      if (!ok) {
        return res.status(400).json({ error: `Invalid cron expression: "${expression}"` });
      }

      cronMeta.set(name, job);
      broadcast({ type: 'cron:created', job });
      res.status(201).json(job);
    }),
  );

  // ─── Trigger manually ────────────────────────────────────────
  app.post(
    '/api/crons/:name/trigger',
    wrapRoute((req, res) => {
      const { name } = req.params as { name: string };
      const job = cronMeta.get(name);
      if (!job) return res.status(404).json({ error: 'Cron job not found' });

      log.info('manual cron trigger', { name });
      makeCronFn(job, broadcast)();
      res.json({ ok: true, job });
    }),
  );

  // ─── Delete cron job ─────────────────────────────────────────
  app.delete(
    '/api/crons/:name',
    wrapRoute((req, res) => {
      const { name } = req.params as { name: string };
      if (!cronMeta.has(name)) return res.status(404).json({ error: 'Cron job not found' });

      scheduler.cancel(name);
      cronMeta.delete(name);
      broadcast({ type: 'cron:deleted', name });
      res.json({ ok: true });
    }),
  );
}
