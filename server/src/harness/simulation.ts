/**
 * ░▒▓ THE SIMULATION ▓▒░
 *
 * "Do you believe that my being stronger or faster has anything to do with
 *  my muscles in this place?"
 *
 * Dry-run mode — shows planned actions without executing them.
 * When enabled, Claude's actions are described but not applied.
 */

import type { HarnessResponse } from '@neo-agent/shared';
import type { HarnessWrapper } from './architect.js';

export class Simulation implements HarnessWrapper {
  readonly name = 'Simulation';
  private dryRun: boolean;

  constructor(dryRun: boolean = false) {
    this.dryRun = dryRun;
  }

  async process(response: HarnessResponse): Promise<HarnessResponse> {
    if (!this.dryRun) return response;

    return {
      ...response,
      dryRun: true,
      content: `[SIMULATION MODE]\n\n${response.validatedContent ?? response.content ?? 'No content'}\n\n[Actions would be applied in live mode]`,
    };
  }
}
