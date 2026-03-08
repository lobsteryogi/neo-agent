/**
 * ░▒▓ ERROR RECOVERY ▓▒░
 *
 * "Something broke in the Matrix. I'm still here though."
 *
 * Classifies errors, logs to audit trail, attempts partial transcript saves,
 * and returns appropriate user-facing responses.
 */

import type { AgentResponse } from '@neo-agent/shared';
import { getQuote } from '../data/matrix-quotes.js';

export interface ErrorRecoveryDeps {
  logError: (sessionKey: string, error: Error) => void;
  savePartialTranscript: (sessionKey: string) => Promise<void>;
}

export class ErrorRecovery {
  private historian: { logError: (key: string, err: Error) => void };
  private memory: { savePartialTranscript: (key: string) => Promise<void> };

  constructor(
    historian: { logError: (key: string, err: Error) => void },
    memory: { savePartialTranscript: (key: string) => Promise<void> },
  ) {
    this.historian = historian;
    this.memory = memory;
  }

  async handle(error: unknown, message: any): Promise<AgentResponse> {
    const err = error instanceof Error ? error : new Error(String(error));

    // 1. Log to audit trail
    this.historian.logError(message.sessionKey ?? 'unknown', err);

    // 2. Attempt partial transcript save
    await this.memory.savePartialTranscript(message.sessionKey ?? 'unknown').catch(() => {});

    // 3. Classify and respond
    if (err.message.includes('TIMEOUT')) {
      return {
        content: `"${getQuote('timeRanOut')}"`,
        model: 'sonnet',
        retryable: true,
        neoQuip: 'The Deadline',
      };
    }

    if (err.message.includes('SQLITE')) {
      return {
        content: message._lastPartialResponse ?? `"${getQuote('memoriesCorrupted')}"`,
        model: 'sonnet',
        retryable: false,
        neoQuip: 'Déjà Vu Error',
      };
    }

    // Generic fallback
    return {
      content: `"${getQuote('somethingBroke')}"`,
      model: 'sonnet',
      retryable: true,
      neoQuip: 'System Error',
    };
  }
}
