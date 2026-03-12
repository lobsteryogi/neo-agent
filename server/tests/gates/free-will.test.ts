import { describe, expect, it } from 'vitest';
import { FreeWillGate } from '../../src/gates/free-will';
import type { InboundMessage, RouteDecision } from '@neo-agent/shared';

// ─── Helpers ────────────────────────────────────────────────────

function msg(content: string): Partial<InboundMessage> {
  return { content };
}

function route(overrides: Partial<RouteDecision> = {}): Partial<RouteDecision> {
  return { requiresExecution: true, selectedModel: 'sonnet', score: 0.5, ...overrides };
}

// ─── Tests ──────────────────────────────────────────────────────

describe('FreeWillGate', () => {
  describe('construction', () => {
    it('exposes name "FreeWill"', () => {
      const gate = new FreeWillGate({ enabled: true, approvalPhrase: 'go' });
      expect(gate.name).toBe('FreeWill');
    });

    it('reflects enabled flag from config', () => {
      const on = new FreeWillGate({ enabled: true, approvalPhrase: 'go' });
      const off = new FreeWillGate({ enabled: false, approvalPhrase: 'go' });
      expect(on.enabled).toBe(true);
      expect(off.enabled).toBe(false);
    });

    it('stores approval phrase in lowercase internally', async () => {
      const gate = new FreeWillGate({ enabled: true, approvalPhrase: 'SHIP IT' });
      // Prove it was lowercased: matching mixed-case input should pass
      const result = await gate.check(msg('ship it please') as any, route() as any);
      expect(result.blocked).toBe(false);
    });
  });

  describe('check — execution required', () => {
    const gate = new FreeWillGate({ enabled: true, approvalPhrase: 'do it' });

    it('blocks when approval phrase is entirely absent', async () => {
      const result = await gate.check(msg('deploy to production') as any, route() as any);
      expect(result.blocked).toBe(true);
      expect(result.gate).toBe('FreeWill');
      expect(result.reason).toContain('approval phrase required');
    });

    it('includes a neoQuip with the phrase in the block verdict', async () => {
      const result = await gate.check(msg('run tests') as any, route() as any);
      expect(result.blocked).toBe(true);
      expect(result.neoQuip).toBeDefined();
      expect(result.neoQuip).toContain('do it');
    });

    it('passes when phrase appears at the start of the message', async () => {
      const result = await gate.check(msg('do it — deploy now') as any, route() as any);
      expect(result.blocked).toBe(false);
    });

    it('passes when phrase appears in the middle', async () => {
      const result = await gate.check(msg('please do it and restart') as any, route() as any);
      expect(result.blocked).toBe(false);
    });

    it('passes when phrase appears at the end', async () => {
      const result = await gate.check(msg('deploy. do it') as any, route() as any);
      expect(result.blocked).toBe(false);
    });

    it('is case-insensitive (uppercase input)', async () => {
      const result = await gate.check(msg('DO IT NOW') as any, route() as any);
      expect(result.blocked).toBe(false);
    });

    it('is case-insensitive (mixed case input)', async () => {
      const result = await gate.check(msg('Do It') as any, route() as any);
      expect(result.blocked).toBe(false);
    });

    it('blocks partial matches ("do" alone is not "do it")', async () => {
      const result = await gate.check(msg('do something') as any, route() as any);
      expect(result.blocked).toBe(true);
    });
  });

  describe('check — no execution required', () => {
    const gate = new FreeWillGate({ enabled: true, approvalPhrase: 'do it' });

    it('passes without the phrase when requiresExecution is false', async () => {
      const result = await gate.check(
        msg('tell me about TypeScript') as any,
        route({ requiresExecution: false }) as any,
      );
      expect(result.blocked).toBe(false);
    });

    it('passes without the phrase when requiresExecution is undefined', async () => {
      const result = await gate.check(msg('hello') as any, {} as any);
      expect(result.blocked).toBe(false);
    });

    it('passes when route is null-ish', async () => {
      const result = await gate.check(msg('hello') as any, null as any);
      expect(result.blocked).toBe(false);
    });
  });

  describe('edge cases', () => {
    const gate = new FreeWillGate({ enabled: true, approvalPhrase: 'do it' });

    it('handles empty message content gracefully', async () => {
      const result = await gate.check(msg('') as any, route() as any);
      expect(result.blocked).toBe(true);
    });

    it('handles undefined message content gracefully', async () => {
      const result = await gate.check({} as any, route() as any);
      expect(result.blocked).toBe(true);
    });

    it('handles message with only whitespace', async () => {
      const result = await gate.check(msg('   ') as any, route() as any);
      expect(result.blocked).toBe(true);
    });
  });

  describe('custom approval phrases', () => {
    it('works with multi-word phrases', async () => {
      const gate = new FreeWillGate({ enabled: true, approvalPhrase: 'i believe' });
      const blocked = await gate.check(msg('run tests') as any, route() as any);
      const passed = await gate.check(msg('i believe so, run tests') as any, route() as any);
      expect(blocked.blocked).toBe(true);
      expect(passed.blocked).toBe(false);
    });

    it('works with single-character phrase', async () => {
      const gate = new FreeWillGate({ enabled: true, approvalPhrase: 'y' });
      const blocked = await gate.check(msg('run') as any, route() as any);
      const passed = await gate.check(msg('deploy y') as any, route() as any);
      expect(blocked.blocked).toBe(true);
      expect(passed.blocked).toBe(false);
    });

    it('works with phrase containing special characters', async () => {
      const gate = new FreeWillGate({ enabled: true, approvalPhrase: 'go!' });
      const passed = await gate.check(msg('deploy go!') as any, route() as any);
      expect(passed.blocked).toBe(false);
    });
  });
});
