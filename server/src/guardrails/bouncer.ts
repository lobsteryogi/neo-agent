/**
 * ░▒▓ THE BOUNCER ▓▒░
 *
 * "I don't know the future. I didn't come here to tell you how this is going to end."
 *
 * Per-session rate limiter. Blocks rapid-fire message flooding.
 */

import type { GuardrailVerdict } from '@neo-agent/shared';
import type { Guardrail } from './redactor.js';

export interface BouncerConfig {
  maxPerMinute: number;
}

interface RateWindow {
  timestamps: number[];
}

export class Bouncer implements Guardrail {
  readonly name = 'Bouncer';
  private maxPerMinute: number;
  private windows = new Map<string, RateWindow>();

  constructor(config: BouncerConfig = { maxPerMinute: 20 }) {
    this.maxPerMinute = config.maxPerMinute;
  }

  async check(message: any): Promise<GuardrailVerdict> {
    const key = message.sessionKey ?? 'global';
    const now = Date.now();
    const windowMs = 60_000;

    let window = this.windows.get(key);
    if (!window) {
      window = { timestamps: [] };
      this.windows.set(key, window);
    }

    // Prune old entries
    window.timestamps = window.timestamps.filter((t) => now - t < windowMs);

    if (window.timestamps.length >= this.maxPerMinute) {
      return {
        blocked: true,
        guard: this.name,
        reason: `Rate limit exceeded: ${this.maxPerMinute} messages per minute`,
        confidence: 1.0,
      };
    }

    window.timestamps.push(now);
    return { blocked: false };
  }
}
