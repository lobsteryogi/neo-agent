import { describe, expect, it } from 'vitest';
import { ROUTING_PROFILES, type ProfileWeights } from '../../src/router/profiles';

describe('Routing Profiles', () => {
  const EXPECTED_PROFILES = ['auto', 'eco', 'balanced', 'premium'] as const;
  const WEIGHT_KEYS: (keyof ProfileWeights)[] = [
    'complexity',
    'tokenEstimate',
    'contextNeeds',
    'precisionRequired',
    'toolUsage',
    'speedPriority',
  ];

  // ── Profile Existence ──────────────────────────────────────

  it('exports all four routing profiles', () => {
    for (const profile of EXPECTED_PROFILES) {
      expect(ROUTING_PROFILES).toHaveProperty(profile);
    }
  });

  it('does not contain unexpected profiles', () => {
    const keys = Object.keys(ROUTING_PROFILES);
    expect(keys).toHaveLength(EXPECTED_PROFILES.length);
    for (const key of keys) {
      expect(EXPECTED_PROFILES).toContain(key);
    }
  });

  // ── Weight Key Completeness ────────────────────────────────

  for (const profile of EXPECTED_PROFILES) {
    it(`"${profile}" has all required weight keys`, () => {
      const weights = ROUTING_PROFILES[profile];
      for (const key of WEIGHT_KEYS) {
        expect(weights).toHaveProperty(key);
        expect(typeof weights[key]).toBe('number');
      }
    });

    it(`"${profile}" has no extra weight keys`, () => {
      const weights = ROUTING_PROFILES[profile];
      const actualKeys = Object.keys(weights);
      expect(actualKeys).toHaveLength(WEIGHT_KEYS.length);
      for (const key of actualKeys) {
        expect(WEIGHT_KEYS).toContain(key);
      }
    });
  }

  // ── Weight Value Constraints ───────────────────────────────

  for (const profile of EXPECTED_PROFILES) {
    it(`"${profile}" speedPriority is negative (favours haiku)`, () => {
      expect(ROUTING_PROFILES[profile].speedPriority).toBeLessThan(0);
    });

    it(`"${profile}" positive weights are between 0 and 1`, () => {
      const weights = ROUTING_PROFILES[profile];
      for (const key of WEIGHT_KEYS) {
        if (key === 'speedPriority') continue;
        expect(weights[key]).toBeGreaterThanOrEqual(0);
        expect(weights[key]).toBeLessThanOrEqual(1);
      }
    });
  }

  // ── Intentional Weight Sums ────────────────────────────────
  // Documentation states: auto=0.8, eco=-0.1, balanced=0.6, premium=1.0

  function sumWeights(profile: (typeof EXPECTED_PROFILES)[number]): number {
    const w = ROUTING_PROFILES[profile];
    return Object.values(w).reduce((a, b) => a + b, 0);
  }

  it('auto profile weights sum to ~0.8', () => {
    expect(sumWeights('auto')).toBeCloseTo(0.8, 5);
  });

  it('eco profile weights sum to ~-0.1', () => {
    expect(sumWeights('eco')).toBeCloseTo(-0.1, 5);
  });

  it('balanced profile weights sum to ~0.6', () => {
    expect(sumWeights('balanced')).toBeCloseTo(0.6, 5);
  });

  it('premium profile weights sum to ~1.0', () => {
    expect(sumWeights('premium')).toBeCloseTo(1.0, 5);
  });

  // ── Profile Ordering / Relative Comparisons ────────────────

  it('eco has the strongest negative speedPriority', () => {
    const eco = ROUTING_PROFILES.eco.speedPriority;
    for (const profile of EXPECTED_PROFILES) {
      if (profile === 'eco') continue;
      expect(eco).toBeLessThan(ROUTING_PROFILES[profile].speedPriority);
    }
  });

  it('premium has the highest complexity weight', () => {
    const premium = ROUTING_PROFILES.premium.complexity;
    for (const profile of EXPECTED_PROFILES) {
      if (profile === 'premium') continue;
      expect(premium).toBeGreaterThanOrEqual(ROUTING_PROFILES[profile].complexity);
    }
  });

  it('premium has the highest precisionRequired weight', () => {
    const premium = ROUTING_PROFILES.premium.precisionRequired;
    for (const profile of EXPECTED_PROFILES) {
      if (profile === 'premium') continue;
      expect(premium).toBeGreaterThanOrEqual(ROUTING_PROFILES[profile].precisionRequired);
    }
  });

  it('eco has the lowest positive weights (cost-conscious)', () => {
    const eco = ROUTING_PROFILES.eco;
    for (const key of WEIGHT_KEYS) {
      if (key === 'speedPriority') continue;
      for (const profile of EXPECTED_PROFILES) {
        if (profile === 'eco') continue;
        expect(eco[key]).toBeLessThanOrEqual(ROUTING_PROFILES[profile][key]);
      }
    }
  });

  it('auto weight sum is between eco and premium', () => {
    expect(sumWeights('auto')).toBeGreaterThan(sumWeights('eco'));
    expect(sumWeights('auto')).toBeLessThanOrEqual(sumWeights('premium'));
  });

  it('balanced weight sum is between eco and premium', () => {
    expect(sumWeights('balanced')).toBeGreaterThan(sumWeights('eco'));
    expect(sumWeights('balanced')).toBeLessThanOrEqual(sumWeights('premium'));
  });
});
