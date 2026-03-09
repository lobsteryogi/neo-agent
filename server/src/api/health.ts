/**
 * ░▒▓ HEALTH ENDPOINT ▓▒░
 *
 * "How do you define real?"
 *
 * Smart health check with proper HTTP status codes:
 * 200 = operational, 207 = degraded, 503 = down
 */

import type { HealthStatus } from '@neo-agent/shared';
import type Database from 'better-sqlite3';
import type { Express } from 'express';
import { statSync } from 'fs';
import type { ToolRegistry } from '../tools/registry.js';
import { logger } from '../utils/logger.js';

const log = logger('health');

function getDbFileSizeMb(): number {
  try {
    const dbPath = process.env.NEO_DB_PATH || 'neo.db';
    const stats = statSync(dbPath);
    return Math.round((stats.size / 1024 / 1024) * 100) / 100;
  } catch {
    return 0;
  }
}

export interface HealthConfig {
  db: Database.Database;
  toolRegistry?: ToolRegistry;
  forceDown?: boolean;
}

export function healthRoute(app: Express, config: HealthConfig): void {
  app.get('/api/health', async (_req, res) => {
    try {
      const status = await getHealthStatus(config);
      const httpStatus = status.status === 'down' ? 503 : status.status === 'degraded' ? 207 : 200;
      res.status(httpStatus).json(status);
    } catch {
      res.status(503).json({ status: 'down', error: 'Health check failed' });
    }
  });
}

async function getHealthStatus(config: HealthConfig): Promise<HealthStatus> {
  if (config.forceDown) {
    return {
      status: 'down',
      uptime: process.uptime(),
      claude: { responsive: false },
      memory: { dbSizeMb: 0, ftsEntries: 0 },
      gates: { blockedLast1h: 0 },
      sync: { behind: false },
      tools: {},
    };
  }

  const memUsage = process.memoryUsage();
  let ftsEntries = 0;
  let gateBlockCount = 0;

  try {
    const ftsResult = config.db.prepare('SELECT COUNT(*) as count FROM memories_fts').get() as any;
    ftsEntries = ftsResult?.count ?? 0;
  } catch (err) {
    log.debug('FTS table query failed', { error: String(err) });
    // FTS table might not exist yet
  }

  try {
    const oneHourAgo = Date.now() - 3_600_000;
    const gateResult = config.db
      .prepare(
        "SELECT COUNT(*) as count FROM audit_log WHERE event_type = 'gate_blocked' AND timestamp > ?",
      )
      .get(oneHourAgo) as any;
    gateBlockCount = gateResult?.count ?? 0;
  } catch (err) {
    log.debug('Audit log query failed', { error: String(err) });
    // audit_log might not exist yet
  }

  // Phase 3 — Tool health checks
  const tools = config.toolRegistry ? await config.toolRegistry.healthCheckAll() : {};

  // Determine overall status — only REQUIRED tools affect health status
  const requiredTools = config.toolRegistry?.getAll().filter((t) => t.required) ?? [];
  const requiredToolNames = new Set(requiredTools.map((t) => t.name));
  const hasDegraded = Object.entries(tools).some(
    ([name, t]) => requiredToolNames.has(name) && (!t.available || t.degraded),
  );

  return {
    status: hasDegraded ? 'degraded' : 'operational',
    uptime: process.uptime(),
    claude: { responsive: true },
    memory: {
      dbSizeMb: getDbFileSizeMb(),
      heapUsedMb: Math.round((memUsage.heapUsed / 1024 / 1024) * 100) / 100,
      ftsEntries,
    },
    gates: { blockedLast1h: gateBlockCount },
    sync: { behind: false },
    tools,
  };
}
