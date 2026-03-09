/**
 * ░▒▓ PERSISTENCE PROTOCOL ▓▒░
 *
 * "To deny our own impulses is to deny the very thing that makes us human."
 *
 * Retries transient errors with exponential backoff (3 attempts).
 */

import type { HarnessResponse } from '@neo-agent/shared';
import type { HarnessWrapper } from './architect.js';

export class PersistenceProtocol implements HarnessWrapper {
  readonly name = 'PersistenceProtocol';
  private maxRetries: number;
  private baseDelayMs: number;

  constructor(maxRetries: number = 3, baseDelayMs: number = 100) {
    this.maxRetries = maxRetries;
    this.baseDelayMs = baseDelayMs;
  }

  async process(response: HarnessResponse): Promise<HarnessResponse> {
    // PersistenceProtocol wraps the save/delivery step, not the response itself.
    // It attaches retry metadata to the response for downstream use.
    return {
      ...response,
      _persistence: {
        maxRetries: this.maxRetries,
        baseDelayMs: this.baseDelayMs,
      },
    };
  }

  async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Don't retry non-transient errors
        if (!this.isTransient(lastError)) throw lastError;

        // Exponential backoff
        const delay = this.baseDelayMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    throw lastError;
  }

  private isTransient(err: Error): boolean {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('sqlite_busy') ||
      msg.includes('database is locked') ||
      msg.includes('econnreset') ||
      msg.includes('timeout')
    );
  }
}
