import { describe, expect, it } from 'vitest';
import { GateManager } from '../../src/gates';
import { CostGate } from '../../src/gates/cost-gate';
import { FileGuard } from '../../src/gates/file-guard';
import { FreeWillGate } from '../../src/gates/free-will';

describe('Free Will Protocol', () => {
  const gate = new FreeWillGate({ enabled: true, approvalPhrase: 'do it' });

  it('blocks when approval phrase is missing', async () => {
    const result = await gate.check(
      { content: 'Deploy to production' },
      { requiresExecution: true },
    );
    expect(result.blocked).toBe(true);
    expect(result.neoQuip).toContain('do it');
  });

  it('passes when approval phrase is present', async () => {
    const result = await gate.check(
      { content: 'Deploy to production. do it' },
      { requiresExecution: true },
    );
    expect(result.blocked).toBe(false);
  });

  it('passes when action does not require execution', async () => {
    const result = await gate.check(
      { content: 'What is TypeScript?' },
      { requiresExecution: false },
    );
    expect(result.blocked).toBe(false);
  });

  it('is case-insensitive for approval phrase', async () => {
    const result = await gate.check({ content: 'DO IT now' }, { requiresExecution: true });
    expect(result.blocked).toBe(false);
  });

  it('supports custom approval phrases', async () => {
    const custom = new FreeWillGate({ enabled: true, approvalPhrase: 'ship it' });
    const blocked = await custom.check({ content: 'do it' }, { requiresExecution: true });
    const passed = await custom.check({ content: 'ship it' }, { requiresExecution: true });
    expect(blocked.blocked).toBe(true);
    expect(passed.blocked).toBe(false);
  });
});

describe('File Guard (Sentinel Program)', () => {
  const guard = new FileGuard({ enabled: true, protectedPaths: ['~/.ssh/', '.env'] });

  it('blocks writes to ~/.ssh/', async () => {
    const result = await guard.check(
      {},
      { plannedActions: [{ type: 'write', path: '~/.ssh/authorized_keys' }] },
    );
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('.ssh');
  });

  it('blocks writes to .env files', async () => {
    const result = await guard.check(
      {},
      { plannedActions: [{ type: 'write', path: '/project/.env.production' }] },
    );
    expect(result.blocked).toBe(true);
  });

  it('passes writes to normal files', async () => {
    const result = await guard.check(
      {},
      { plannedActions: [{ type: 'write', path: '/project/src/index.ts' }] },
    );
    expect(result.blocked).toBe(false);
  });

  it('only checks write/delete actions, not reads', async () => {
    const result = await guard.check(
      {},
      { plannedActions: [{ type: 'read', path: '~/.ssh/config' }] },
    );
    expect(result.blocked).toBe(false);
  });
});

describe("Cost Gate (Architect's Tax)", () => {
  const gate = new CostGate({ enabled: true, warnThreshold: 0.7 });

  it('blocks when routing score indicates opus-level cost', async () => {
    const result = await gate.check({}, { selectedModel: 'opus', score: 0.9 });
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('expensive');
  });

  it('passes when model is sonnet or haiku', async () => {
    expect((await gate.check({}, { selectedModel: 'sonnet' })).blocked).toBe(false);
    expect((await gate.check({}, { selectedModel: 'haiku' })).blocked).toBe(false);
  });
});

describe('GateManager (Integration)', () => {
  it('runs all enabled gates in sequence', async () => {
    const manager = new GateManager({
      freeWill: { enabled: true, approvalPhrase: 'do it' },
      fileGuard: { enabled: true, protectedPaths: ['~/.ssh/'] },
      costGate: { enabled: false, warnThreshold: 0.7 },
    });
    const result = await manager.check({ content: 'write something' }, { requiresExecution: true });
    expect(result.blocked).toBe(true);
  });

  it('skips disabled gates', async () => {
    const manager = new GateManager({
      freeWill: { enabled: false, approvalPhrase: 'do it' },
      fileGuard: { enabled: false },
      costGate: { enabled: false },
    });
    const result = await manager.check({ content: 'anything' }, { requiresExecution: true });
    expect(result.blocked).toBe(false);
  });
});
