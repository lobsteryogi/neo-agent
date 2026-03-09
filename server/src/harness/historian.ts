/**
 * ░▒▓ THE HISTORIAN ▓▒░
 *
 * "I remember everything. It is my curse."
 *
 * Immutable audit log to SQLite. Every gate check, tool call,
 * guardrail block, and response is recorded.
 */

import type { GateVerdict, GuardrailVerdict, HarnessResponse, Session } from '@neo-agent/shared';
import type Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';
import type { HarnessWrapper } from './architect.js';

const log = logger('historian');

export class Historian implements HarnessWrapper {
  readonly name = 'Historian';
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  async process(response: HarnessResponse, session?: Session): Promise<HarnessResponse> {
    this.log(session?.id ?? 'unknown', 'response', {
      model: response.model,
      tokensUsed: response.tokensUsed,
      hasContent: !!response.validatedContent || !!response.content,
    });
    return response;
  }

  log(sessionId: string, action: string, details: Record<string, unknown> = {}): void {
    try {
      this.db
        .prepare(
          'INSERT INTO audit_log (session_id, event_type, details, timestamp) VALUES (?, ?, ?, ?)',
        )
        .run(sessionId, action, JSON.stringify(details), Date.now());
    } catch (err) {
      // Never let audit logging crash the main flow, but log for debugging
      log.warn('Audit log write failed', { sessionId, action, error: String(err) });
    }
  }

  logError(sessionKey: string, error: Error): void {
    this.log(sessionKey, 'error', {
      message: error.message,
      stack: error.stack?.slice(0, 500),
    });
  }

  logGateBlock(sessionId: string, verdict: GateVerdict): void {
    this.log(sessionId, 'gate_blocked', {
      gate: verdict.gate,
      reason: verdict.reason,
    });
  }

  logGuardrailBlock(sessionId: string, verdict: GuardrailVerdict): void {
    this.log(sessionId, 'guardrail_blocked', {
      guard: verdict.guard,
      reason: verdict.reason,
    });
  }
}
