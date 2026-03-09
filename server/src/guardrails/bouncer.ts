/**
 * ░▒▓ THE BOUNCER ▓▒░
 *
 * "I don't know the future. I didn't come here to tell you how this is going to end."
 *
 * Per-session rate limiter. Blocks rapid-fire message flooding.
 */

import type { GuardrailVerdict, InboundMessage, SanitizedMessage } from '@neo-agent/shared';
import { logger } from '../utils/logger.js';
import type { Guardrail } from './redactor.js';

const log = logger('bouncer');

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
  private lastPrune = Date.now();

  constructor(config: BouncerConfig = { maxPerMinute: 20 }) {
    this.maxPerMinute = config.maxPerMinute;
  }

  async check(message: InboundMessage | SanitizedMessage): Promise<GuardrailVerdict> {
    const key = message.sessionKey ?? 'global';
    const now = Date.now();
    const windowMs = 60_000;

    // Periodically prune stale entries to prevent unbounded map growth
    if (now - this.lastPrune > 120_000) {
      this.pruneStaleWindows(now, windowMs);
      this.lastPrune = now;
    }

    let window = this.windows.get(key);
    if (!window) {
      window = { timestamps: [] };
      this.windows.set(key, window);
    }

    // Prune old entries
    window.timestamps = window.timestamps.filter((t) => now - t < windowMs);

    if (window.timestamps.length >= this.maxPerMinute) {
      log.warn('Rate limit exceeded', {
        key,
        count: window.timestamps.length,
        maxPerMinute: this.maxPerMinute,
      });
      return {
        blocked: true,
        guard: this.name,
        reason: `Rate limit exceeded: ${this.maxPerMinute} messages per minute`,
        confidence: 1.0,
      };
    }

    window.timestamps.push(now);
    log.debug('Rate check passed', {
      key,
      count: window.timestamps.length,
      maxPerMinute: this.maxPerMinute,
    });
    return { blocked: false };
  }

  private pruneStaleWindows(now: number, windowMs: number): void {
    for (const [key, window] of this.windows) {
      const latest = window.timestamps[window.timestamps.length - 1] ?? 0;
      if (now - latest > windowMs * 2) {
        this.windows.delete(key);
      }
    }
  }
}
