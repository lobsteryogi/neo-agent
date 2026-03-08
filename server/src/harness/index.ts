/**
 * ░▒▓ HARNESS PIPELINE ▓▒░
 *
 * "There's a difference between knowing the path and walking the path."
 *
 * Orchestrates all harness wrappers on Claude's output:
 * Architect → Simulation → Deadline → PersistenceProtocol → Historian
 */

import type Database from 'better-sqlite3';
import { Architect, type HarnessWrapper } from './architect.js';
import { Deadline } from './deadline.js';
import { Historian } from './historian.js';
import { PersistenceProtocol } from './persistence.js';
import { Simulation } from './simulation.js';

export interface HarnessPipelineConfig {
  db: Database.Database;
  dryRun?: boolean;
  timeoutMs?: number;
  maxRetries?: number;
}

export class HarnessPipeline {
  private wrappers: HarnessWrapper[];
  readonly historian: Historian;

  constructor(config: HarnessPipelineConfig) {
    this.historian = new Historian(config.db);

    this.wrappers = [
      new Architect(),
      new Simulation(config.dryRun),
      new Deadline(config.timeoutMs),
      new PersistenceProtocol(config.maxRetries),
      this.historian,
    ];
  }

  async process(response: any, session?: any): Promise<any> {
    let current = response;

    for (const wrapper of this.wrappers) {
      current = await wrapper.process(current, session);
    }

    return current;
  }
}

export { Architect } from './architect.js';
export type { HarnessWrapper } from './architect.js';
export { Deadline } from './deadline.js';
export { Historian } from './historian.js';
export { PersistenceProtocol } from './persistence.js';
export { Simulation } from './simulation.js';
