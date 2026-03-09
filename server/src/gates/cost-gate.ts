/**
 * ░▒▓ ARCHITECT'S TAX ▓▒░
 *
 * "Everything that has a beginning has an end."
 * ...and everything that uses Opus has a cost.
 *
 * Blocks when routing indicates an expensive model (opus).
 */

import type { GateVerdict, InboundMessage, RouteDecision } from '@neo-agent/shared';
import type { Gate } from './free-will.js';

export interface CostGateConfig {
  enabled: boolean;
  warnThreshold?: number;
}

export class CostGate implements Gate {
  readonly name = 'CostGate';
  readonly enabled: boolean;
  private warnThreshold: number;

  constructor(config: CostGateConfig) {
    this.enabled = config.enabled;
    this.warnThreshold = config.warnThreshold ?? 0.7;
  }

  async check(_message: InboundMessage, route: RouteDecision): Promise<GateVerdict> {
    const model = route?.selectedModel;

    if (model === 'opus') {
      return {
        blocked: true,
        gate: this.name,
        reason: `Architect's Tax: routed to opus (expensive)`,
        neoQuip: `"This task wants Opus. That's the expensive pill. Confirm to proceed."`,
        confidence: route?.score ?? 1.0,
      };
    }

    return { blocked: false };
  }
}
