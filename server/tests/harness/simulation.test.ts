import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/harness/simulation';

describe('Simulation (Dry-Run Mode)', () => {
  it('has the correct wrapper name', () => {
    const sim = new Simulation();
    expect(sim.name).toBe('Simulation');
  });

  // ─── Live mode (dryRun = false) ─────────────────────────────

  it('passes response through unchanged when dryRun is false', async () => {
    const sim = new Simulation(false);
    const response = { content: 'Do the thing', model: 'sonnet' as const };
    const result = await sim.process(response);

    expect(result).toEqual(response);
    expect(result.dryRun).toBeUndefined();
  });

  it('defaults to live mode (dryRun = false)', async () => {
    const sim = new Simulation();
    const response = { content: 'Execute' };
    const result = await sim.process(response);

    expect(result).toEqual(response);
    expect(result.dryRun).toBeUndefined();
  });

  // ─── Dry-run mode (dryRun = true) ──────────────────────────

  it('wraps content in simulation markers when dryRun is true', async () => {
    const sim = new Simulation(true);
    const response = { content: 'Deploy to production' };
    const result = await sim.process(response);

    expect(result.dryRun).toBe(true);
    expect(result.content).toContain('[SIMULATION MODE]');
    expect(result.content).toContain('Deploy to production');
    expect(result.content).toContain('[Actions would be applied in live mode]');
  });

  it('uses validatedContent when available in dry-run mode', async () => {
    const sim = new Simulation(true);
    const response = {
      content: 'Original',
      validatedContent: 'Validated text',
    };
    const result = await sim.process(response);

    expect(result.content).toContain('Validated text');
    expect(result.content).not.toContain('Original');
  });

  it('prefers validatedContent over content', async () => {
    const sim = new Simulation(true);
    const response = {
      content: 'raw',
      validatedContent: 'validated',
    };
    const result = await sim.process(response);

    expect(result.content).toContain('validated');
  });

  it('falls back to "No content" when both content and validatedContent are missing', async () => {
    const sim = new Simulation(true);
    const response = { model: 'haiku' as const };
    const result = await sim.process(response);

    expect(result.content).toContain('No content');
    expect(result.dryRun).toBe(true);
  });

  it('preserves other response fields in dry-run mode', async () => {
    const sim = new Simulation(true);
    const response = { content: 'test', model: 'opus' as const, tokensUsed: 500 };
    const result = await sim.process(response);

    expect(result.model).toBe('opus');
    expect(result.tokensUsed).toBe(500);
    expect(result.dryRun).toBe(true);
  });
});
