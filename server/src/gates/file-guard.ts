/**
 * ░▒▓ SENTINEL PROGRAM ▓▒░
 *
 * "Sentinels. For search and destroy."
 *
 * Blocks write/delete actions to protected paths like ~/.ssh/, .env, etc.
 * Read actions are always allowed.
 */

import type { GateVerdict, InboundMessage, PlannedAction, RouteDecision } from '@neo-agent/shared';
import type { Gate } from './free-will.js';

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

    for (const action of actions) {
      // Only block write/delete, not reads
      if (action.type === 'read') continue;

      if (action.path && this.isProtected(action.path)) {
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
      return normalized.includes(p) || normalized.startsWith(p);
    });
  }
}
