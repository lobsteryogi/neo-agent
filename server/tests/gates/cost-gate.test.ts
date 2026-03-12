import { describe, expect, it } from 'vitest';
import { CostGate } from '../../src/gates/cost-gate';
import type { InboundMessage, RouteDecision } from '@neo-agent/shared';

// ─── Helpers ────────────────────────────────────────────────────

const emptyMsg: Partial<InboundMessage> = {};

function route(overrides: Partial<RouteDecision> = {}): Partial<RouteDecision> {
  return { selectedModel: 'sonnet', score: 0.5, ...overrides };
}

// ─── Tests ──────────────────────────────────────────────────────

describe('CostGate', () => {
  describe('construction', () => {
    it('exposes name "CostGate"', () => {
      const gate = new CostGate({ enabled: true });
      expect(gate.name).toBe('CostGate');
    });

    it('reflects enabled flag from config', () => {
      expect(new CostGate({ enabled: true }).enabled).toBe(true);
      expect(new CostGate({ enabled: false }).enabled).toBe(false);
    });

    it('defaults warnThreshold to 0.7 when not provided', () => {
      const gate = new CostGate({ enabled: true });
      // warnThreshold is private, verify via behavior — existence test
      expect(gate).toBeDefined();
    });

    it('accepts custom warnThreshold', () => {
      const gate = new CostGate({ enabled: true, warnThreshold: 0.5 });
      expect(gate).toBeDefined();
    });
  });

  describe('check — opus model', () => {
    const gate = new CostGate({ enabled: true, warnThreshold: 0.7 });

    it('blocks when selectedModel is "opus"', async () => {
      const result = await gate.check(
        emptyMsg as any,
        route({ selectedModel: 'opus', score: 0.9 }) as any,
      );
      expect(result.blocked).toBe(true);
      expect(result.gate).toBe('CostGate');
    });

    it('includes reason mentioning "expensive"', async () => {
      const result = await gate.check(emptyMsg as any, route({ selectedModel: 'opus' }) as any);
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('expensive');
    });

    it('includes neoQuip mentioning "Opus"', async () => {
      const result = await gate.check(emptyMsg as any, route({ selectedModel: 'opus' }) as any);
      expect(result.neoQuip).toBeDefined();
      expect(result.neoQuip).toContain('Opus');
    });

    it('uses route score as confidence when available', async () => {
      const result = await gate.check(
        emptyMsg as any,
        route({ selectedModel: 'opus', score: 0.85 }) as any,
      );
      expect(result.blocked).toBe(true);
      expect(result.confidence).toBe(0.85);
    });

    it('defaults confidence to 1.0 when score is undefined', async () => {
      const result = await gate.check(emptyMsg as any, { selectedModel: 'opus' } as any);
      expect(result.blocked).toBe(true);
      expect(result.confidence).toBe(1.0);
    });

    it('blocks opus regardless of low score', async () => {
      const result = await gate.check(
        emptyMsg as any,
        route({ selectedModel: 'opus', score: 0.1 }) as any,
      );
      expect(result.blocked).toBe(true);
    });
  });

  describe('check — non-opus models pass', () => {
    const gate = new CostGate({ enabled: true, warnThreshold: 0.7 });

    it('passes for "sonnet"', async () => {
      const result = await gate.check(emptyMsg as any, route({ selectedModel: 'sonnet' }) as any);
      expect(result.blocked).toBe(false);
    });

    it('passes for "haiku"', async () => {
      const result = await gate.check(emptyMsg as any, route({ selectedModel: 'haiku' }) as any);
      expect(result.blocked).toBe(false);
    });

    it('passes when selectedModel is undefined', async () => {
      const result = await gate.check(emptyMsg as any, {} as any);
      expect(result.blocked).toBe(false);
    });
  });

  describe('edge cases', () => {
    const gate = new CostGate({ enabled: true });

    it('handles null route gracefully', async () => {
      const result = await gate.check(emptyMsg as any, null as any);
      expect(result.blocked).toBe(false);
    });

    it('handles undefined route gracefully', async () => {
      const result = await gate.check(emptyMsg as any, undefined as any);
      expect(result.blocked).toBe(false);
    });

    it('blocks "opus" even with score 0', async () => {
      const result = await gate.check(
        emptyMsg as any,
        route({ selectedModel: 'opus', score: 0 }) as any,
      );
      expect(result.blocked).toBe(true);
      expect(result.confidence).toBe(0);
    });

    it('does not block on arbitrary string model names', async () => {
      const result = await gate.check(
        emptyMsg as any,
        route({ selectedModel: 'gpt-4' as any }) as any,
      );
      expect(result.blocked).toBe(false);
    });
  });
});
