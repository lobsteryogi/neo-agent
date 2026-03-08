/**
 * ░▒▓ GATE MANAGER ▓▒░
 *
 * "I can only show you the door. You're the one that has to walk through it."
 *
 * Orchestrates all enabled gates in sequence.
 * Returns on first block — subsequent gates are skipped.
 */

import type { GateVerdict } from '@neo-agent/shared';
import { CostGate, type CostGateConfig } from './cost-gate.js';
import { FileGuard, type FileGuardConfig } from './file-guard.js';
import { FreeWillGate, type FreeWillConfig, type Gate } from './free-will.js';

export interface GateManagerConfig {
  freeWill: FreeWillConfig;
  fileGuard: FileGuardConfig;
  costGate: CostGateConfig;
}

export class GateManager {
  private gates: Gate[];

  constructor(config: GateManagerConfig) {
    this.gates = [
      new FreeWillGate(config.freeWill),
      new FileGuard(config.fileGuard),
      new CostGate(config.costGate),
    ].filter((g) => g.enabled);
  }

  async check(message: any, route: any): Promise<GateVerdict> {
    for (const gate of this.gates) {
      const verdict = await gate.check(message, route);
      if (verdict.blocked) return verdict;
    }
    return { blocked: false };
  }
}

export { CostGate } from './cost-gate.js';
export { FileGuard } from './file-guard.js';
export { FreeWillGate } from './free-will.js';
export type { Gate } from './free-will.js';
