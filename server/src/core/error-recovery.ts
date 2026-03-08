/**
 * ░▒▓ ERROR RECOVERY ▓▒░
 *
 * "Something broke in the Matrix. I'm still here though."
 *
 * Classifies errors, logs to audit trail, attempts partial transcript saves,
 * and returns appropriate user-facing responses.
 */

import type { AgentResponse } from '@neo-agent/shared';

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
        content: '"Time ran out. Even in the Matrix, patience has limits."',
        model: 'sonnet',
        retryable: true,
        neoQuip: 'The Deadline',
      };
    }

    if (err.message.includes('SQLITE')) {
      return {
        content:
          message._lastPartialResponse ??
          '"My memories are... corrupted. I delivered the response but couldn\'t save it."',
        model: 'sonnet',
        retryable: false,
        neoQuip: 'Déjà Vu Error',
      };
    }

    // Generic fallback
    return {
      content: '"Something broke in the Matrix. I\'m still here though."',
      model: 'sonnet',
      retryable: true,
      neoQuip: 'System Error',
    };
  }
}
