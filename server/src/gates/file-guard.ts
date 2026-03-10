/**
 * ░▒▓ SENTINEL PROGRAM ▓▒░
 *
 * "Sentinels. For search and destroy."
 *
 * Blocks write/delete actions to protected paths like ~/.ssh/, .env, etc.
 * Read actions are always allowed.
 */

import type { GateVerdict, InboundMessage, PlannedAction, RouteDecision } from '@neo-agent/shared';
import { logger } from '../utils/logger.js';
import type { Gate } from './free-will.js';

const log = logger('gate:file-guard');

export interface FileGuardConfig {
  enabled: boolean;
  protectedPaths?: string[];
}

export class FileGuard implements Gate {
  readonly name = 'FileGuard';
  readonly enabled: boolean;
  private protectedPaths: string[];

  constructor(config: FileGuardConfig) {
    this.enabled = config.enabled;
    this.protectedPaths = config.protectedPaths ?? ['~/.ssh/', '~/.gnupg/', '.env'];
  }

  async check(_message: InboundMessage, route: RouteDecision): Promise<GateVerdict> {
    const actions: PlannedAction[] = route?.plannedActions ?? [];
    log.debug('Checking actions', {
      actionCount: actions.length,
      protectedPaths: this.protectedPaths,
    });

    for (const action of actions) {
      // Only block write/delete, not reads
      if (action.type === 'read') continue;

      if (action.path && this.isProtected(action.path)) {
        log.warn('Protected path blocked', { type: action.type, path: action.path });
        return {
          blocked: true,
          gate: this.name,
          reason: `Sentinel Program: ${action.type} to protected path "${action.path}"`,
          neoQuip: `"That path is protected by the Sentinels. I can't let you do that."`,
          pendingAction: [action],
        };
      }
    }

    return { blocked: false };
  }

  private isProtected(path: string): boolean {
    const normalized = path.toLowerCase();
    return this.protectedPaths.some((pp) => {
      const p = pp.toLowerCase();
      // Directory pattern (e.g. ~/.ssh/): check if path contains this directory
      if (p.endsWith('/')) return normalized.includes(p);
      // File pattern (e.g. .env): check if any path segment starts with the pattern
      const segments = normalized.split('/');
      return segments.some((seg) => seg === p || seg.startsWith(p));
    });
  }
}
