/**
 * ░▒▓ THE ACCOUNTANT ▓▒░
 *
 * "Do not try and bend the spoon. Instead, only try to realize the truth..."
 * There IS a token limit.
 *
 * Rejects messages that would push context past a hard token cap.
 */

import type { GuardrailVerdict } from '@neo-agent/shared';
import type { Guardrail } from './redactor.js';

export interface AccountantConfig {
  maxTokens: number;
}

export class Accountant implements Guardrail {
  readonly name = 'Accountant';
  private maxTokens: number;

  constructor(config: AccountantConfig = { maxTokens: 200_000 }) {
    this.maxTokens = config.maxTokens;
  }

  async check(message: any): Promise<GuardrailVerdict> {
    // Rough estimate: 1 token ≈ 4 chars
    const estimatedTokens = Math.ceil((message.content ?? '').length / 4);
    const currentTokens = message.currentContextTokens ?? 0;
    const projected = currentTokens + estimatedTokens;

    if (projected > this.maxTokens) {
      return {
        blocked: true,
        guard: this.name,
        reason: `Token budget exceeded: ${projected.toLocaleString()} > ${this.maxTokens.toLocaleString()}`,
        confidence: 1.0,
      };
    }

    return { blocked: false };
  }
}
