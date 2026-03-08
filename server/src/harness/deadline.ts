/**
 * ░▒▓ THE DEADLINE ▓▒░
 *
 * "Time ran out. Even in the Matrix, patience has limits."
 *
 * Hard timeout per invocation (default 600s / 10 minutes).
 */

import type { HarnessWrapper } from './architect.js';

export class Deadline implements HarnessWrapper {
  readonly name = 'Deadline';
  private timeoutMs: number;

  constructor(timeoutMs: number = 600_000) {
    this.timeoutMs = timeoutMs;
  }

  async process(response: any): Promise<any> {
    // Deadline is primarily enforced in ClaudeBridge via AbortController.
    // This harness wrapper adds timing metadata for observability.
    return {
      ...response,
      _deadline: {
        maxMs: this.timeoutMs,
        timestamp: Date.now(),
      },
    };
  }
}
