/**
 * ░▒▓ ROUTING PROFILES ▓▒░
 *
 * "You think that's air you're breathing now?"
 *
 * Weight vectors for each routing profile — used by RouterEngine
 * to bias model tier selection toward speed, quality, or cost.
 */

import type { RoutingProfile } from '@neo-agent/shared';

/**
 * Each weight controls how much a classification axis
 * influences the final routing score.
 *
 * Higher weight = more influence on pushing towards opus.
 * speedPriority is NEGATIVE — high speed priority pulls score down (→ haiku).
 *
 * Weight sums vary by profile (not normalized to 1.0):
 *   auto=0.8, eco=-0.1, balanced=0.6, premium=1.0
 * This is intentional — it shifts the score range relative to the
 * tier thresholds: ≥0.7 → opus, ≥0.4 → sonnet, <0.4 → haiku.
 */
export interface ProfileWeights {
  complexity: number;
  tokenEstimate: number;
  contextNeeds: number;
  precisionRequired: number;
  toolUsage: number;
  speedPriority: number; // negative — high speed priority favours haiku
}

export const ROUTING_PROFILES: Record<RoutingProfile, ProfileWeights> = {
  /** Balanced scoring — let the classifier drive */
  auto: {
    complexity: 0.3,
    tokenEstimate: 0.1,
    contextNeeds: 0.15,
    precisionRequired: 0.25,
    toolUsage: 0.1,
    speedPriority: -0.1,
  },

  /** Cost-conscious — biases toward haiku/sonnet */
  eco: {
    complexity: 0.15,
    tokenEstimate: 0.05,
    contextNeeds: 0.1,
    precisionRequired: 0.1,
    toolUsage: 0.05,
    speedPriority: -0.55, // heavy speed/cost bias
  },

  /** Even split — a middle ground */
  balanced: {
    complexity: 0.25,
    tokenEstimate: 0.1,
    contextNeeds: 0.15,
    precisionRequired: 0.2,
    toolUsage: 0.1,
    speedPriority: -0.2,
  },

  /** Quality-first — biases toward opus */
  premium: {
    complexity: 0.35,
    tokenEstimate: 0.1,
    contextNeeds: 0.2,
    precisionRequired: 0.3,
    toolUsage: 0.15,
    speedPriority: -0.1,
  },
};
