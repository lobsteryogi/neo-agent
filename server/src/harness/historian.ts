/**
 * ░▒▓ THE HISTORIAN ▓▒░
 *
 * "I remember everything. It is my curse."
 *
 * Immutable audit log to SQLite. Every gate check, tool call,
 * guardrail block, and response is recorded.
 */

import type Database from 'better-sqlite3';

export class Historian implements HarnessWrapper {
  readonly name = 'Historian';
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  async process(response: any, session?: any): Promise<any> {
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
          'INSERT INTO audit_log (session_id, action, details, timestamp) VALUES (?, ?, ?, ?)',
        )
        .run(sessionId, action, JSON.stringify(details), Date.now());
    } catch {
      // Never let audit logging crash the main flow
    }
  }

  logError(sessionKey: string, error: Error): void {
    this.log(sessionKey, 'error', {
      message: error.message,
      stack: error.stack?.slice(0, 500),
    });
  }

  logGateBlock(sessionId: string, verdict: any): void {
    this.log(sessionId, 'gate_blocked', {
      gate: verdict.gate,
      reason: verdict.reason,
    });
  }

  logGuardrailBlock(sessionId: string, verdict: any): void {
    this.log(sessionId, 'guardrail_blocked', {
      guard: verdict.guard,
      reason: verdict.reason,
    });
  }
}

import type { HarnessWrapper } from './architect.js';
