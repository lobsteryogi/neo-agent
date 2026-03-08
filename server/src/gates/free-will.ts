/**
 * ░▒▓ FREE WILL PROTOCOL ▓▒░
 *
 * "What is the Matrix? Control."
 *
 * Blocks execution unless the approval phrase is present in the message.
 * Only applies to messages that require execution (writes, shell, etc.)
 */

import type { GateVerdict } from '@neo-agent/shared';

export interface FreeWillConfig {
  enabled: boolean;
  approvalPhrase: string;
}

export interface Gate {
  name: string;
  enabled: boolean;
  check(message: any, route: any): Promise<GateVerdict>;
}

export class FreeWillGate implements Gate {
  readonly name = 'FreeWill';
  readonly enabled: boolean;
  private phrase: string;

  constructor(config: FreeWillConfig) {
    this.enabled = config.enabled;
    this.phrase = config.approvalPhrase.toLowerCase();
  }

  async check(message: any, route: any): Promise<GateVerdict> {
    // Only gate execution actions
    if (!route?.requiresExecution) {
      return { blocked: false };
    }

    const content = (message.content ?? '').toLowerCase();
    if (content.includes(this.phrase)) {
      return { blocked: false };
    }

    return {
      blocked: true,
      gate: this.name,
      reason: `Free Will Protocol: approval phrase required`,
      neoQuip: `"You need to say '${this.phrase}' to proceed. Free will isn't free."`,
    };
  }
}
