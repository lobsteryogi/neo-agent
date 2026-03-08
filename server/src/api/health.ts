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

export interface HealthConfig {
  db: Database.Database;
  forceDown?: boolean;
}

export function healthRoute(app: Express, config: HealthConfig): void {
  app.get('/api/health', async (_req, res) => {
    try {
      const status = getHealthStatus(config);
      const httpStatus = status.status === 'down' ? 503 : status.status === 'degraded' ? 207 : 200;
      res.status(httpStatus).json(status);
    } catch {
      res.status(503).json({ status: 'down', error: 'Health check failed' });
    }
  });
}

function getHealthStatus(config: HealthConfig): HealthStatus {
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
  } catch {
    // FTS table might not exist yet
  }

  try {
    const oneHourAgo = Date.now() - 3_600_000;
    const gateResult = config.db
      .prepare(
        "SELECT COUNT(*) as count FROM audit_log WHERE action = 'gate_blocked' AND timestamp > ?",
      )
      .get(oneHourAgo) as any;
    gateBlockCount = gateResult?.count ?? 0;
  } catch {
    // audit_log might not exist yet
  }

  return {
    status: 'operational',
    uptime: process.uptime(),
    claude: { responsive: true },
    memory: {
      dbSizeMb: Math.round((memUsage.heapUsed / 1024 / 1024) * 100) / 100,
      ftsEntries,
    },
    gates: { blockedLast1h: gateBlockCount },
    sync: { behind: false },
    tools: {},
  };
}
