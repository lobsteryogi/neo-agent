/**
 * ░▒▓ ROUTER ENGINE ▓▒░
 *
 * "Dodge this."
 *
 * Weighted scoring → model tier selection with outcome logging.
 * Addresses Audit Fix S2: routing outcome tracking for future calibration.
 */

import type {
  ModelTier,
  RouteDecision,
  RoutingProfile,
  TaskClassification,
} from '@neo-agent/shared';
import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';
import { ROUTING_PROFILES, type ProfileWeights } from './profiles.js';

/** Max turns per complexity tier */
const TURNS_BY_COMPLEXITY = {
  high: 20,
  mid: 10,
  low: 5,
} as const;

export { ROUTING_PROFILES };

export class RouterEngine {
  private insertAuditStmt: Statement;

  constructor(private db: Database.Database) {
    this.insertAuditStmt = db.prepare(
      `INSERT INTO audit_log (timestamp, event_type, model_used, response_summary)
       VALUES (?, 'route_decision', ?, ?)`,
    );
  }

  /**
   * Score the classification against a routing profile and select the
   * optimal model tier. Logs every decision for calibration (Audit Fix S2).
   */
  selectModel(classification: TaskClassification, profile: RoutingProfile = 'auto'): RouteDecision {
    const weights = ROUTING_PROFILES[profile];
    const score = this.computeScore(classification, weights);
    const selectedModel = this.scoreToTier(score);

    // Determine max turns based on complexity
    const maxTurns =
      classification.complexity >= 0.7
        ? TURNS_BY_COMPLEXITY.high
        : classification.complexity >= 0.4
          ? TURNS_BY_COMPLEXITY.mid
          : TURNS_BY_COMPLEXITY.low;

    // Audit Fix S2 — log every routing decision for future calibration
    try {
      this.insertAuditStmt.run(
        Date.now(),
        selectedModel,
        JSON.stringify({ score, classification, profile }),
      );
    } catch {
      // Non-critical — don't crash on audit logging failure
    }

    return {
      selectedModel,
      score,
      classification,
      maxTurns,
    };
  }

  // ── Private ──────────────────────────────────────────────────

  private computeScore(c: TaskClassification, w: ProfileWeights): number {
    return (
      c.complexity * w.complexity +
      Math.min(c.tokenEstimate / 8000, 1) * w.tokenEstimate +
      c.contextNeeds * w.contextNeeds +
      c.precisionRequired * w.precisionRequired +
      (c.toolUsage ? 1 : 0) * w.toolUsage +
      c.speedPriority * w.speedPriority
    );
  }

  private scoreToTier(score: number): ModelTier {
    if (score >= 0.7) return 'opus';
    // Minimum tier is sonnet — haiku is too weak for general use
    return 'sonnet';
  }
}
