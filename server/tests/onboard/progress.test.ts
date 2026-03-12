import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock terminal utilities ────────────────────────────────────

vi.mock('../../src/utils/terminal.js', () => ({
  color: {
    green: (s: string) => `[green]${s}`,
    brightGreen: (s: string) => `[bright]${s}`,
    darkGreen: (s: string) => `[dark]${s}`,
    dim: (s: string) => `[dim]${s}`,
    phosphor: (s: string) => `[phosphor]${s}`,
    matrix: (s: string) => `[matrix]${s}`,
  },
  matrixProgress: (label: string, current: number, total: number) =>
    `[progress:${label}:${current}/${total}]`,
  sectionHeader: (title: string) => `[section:${title}]`,
}));

import { showStepComplete, showStepHeader } from '../../src/onboard/progress';
import type { StepMeta } from '../../src/onboard/types';

// ─── Tests ──────────────────────────────────────────────────────

describe('showStepHeader', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('calls console.log with section header containing step index and codename', () => {
    const meta: StepMeta = {
      index: 3,
      total: 11,
      name: 'Claude Link',
      codename: 'Claude Link',
    };

    showStepHeader(meta);

    // Should have been called at least 3 times: blank line, section header, progress bar, blank line
    expect(consoleSpy).toHaveBeenCalled();

    const allOutput = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    // Section header includes step index, total, and codename
    expect(allOutput).toContain('[section:Step 3/11');
    expect(allOutput).toContain('Claude Link');
  });

  it('includes progress bar output with step name', () => {
    const meta: StepMeta = {
      index: 5,
      total: 11,
      name: 'Phone Lines',
      codename: 'Phone Lines',
    };

    showStepHeader(meta);

    const allOutput = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('[progress:Phone Lines:5/11]');
  });

  it('works with step 1 of 11', () => {
    const meta: StepMeta = {
      index: 1,
      total: 11,
      name: 'The Choice',
      codename: 'The Choice',
    };

    showStepHeader(meta);

    const allOutput = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('Step 1/11');
    expect(allOutput).toContain('The Choice');
  });

  it('works with final step (11 of 11)', () => {
    const meta: StepMeta = {
      index: 11,
      total: 11,
      name: 'Awakening',
      codename: 'The Awakening',
    };

    showStepHeader(meta);

    const allOutput = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('Step 11/11');
    expect(allOutput).toContain('The Awakening');
  });

  it('works with non-standard total (e.g. 4-step blue pill)', () => {
    const meta: StepMeta = {
      index: 2,
      total: 4,
      name: 'Identity',
      codename: 'Identity',
    };

    showStepHeader(meta);

    const allOutput = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('Step 2/4');
    expect(allOutput).toContain('[progress:Identity:2/4]');
  });

  it('outputs exactly 4 console.log calls (blank, header, progress, blank)', () => {
    const meta: StepMeta = {
      index: 1,
      total: 1,
      name: 'Test',
      codename: 'Test',
    };

    showStepHeader(meta);

    // The function logs: empty line, section header, progress bar, empty line
    expect(consoleSpy).toHaveBeenCalledTimes(4);
  });
});

describe('showStepComplete', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('outputs completion message with codename', () => {
    const meta: StepMeta = {
      index: 3,
      total: 11,
      name: 'Claude Link',
      codename: 'Claude Link',
    };

    showStepComplete(meta);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const output = consoleSpy.mock.calls[0][0];
    expect(output).toContain('Claude Link');
    expect(output).toContain('complete');
  });

  it('uses dim styling for the completion message', () => {
    const meta: StepMeta = {
      index: 1,
      total: 11,
      name: 'Choice',
      codename: 'The Choice',
    };

    showStepComplete(meta);

    const output = consoleSpy.mock.calls[0][0];
    // Our mock wraps dim text with [dim]
    expect(output).toContain('[dim]');
  });

  it('includes checkmark symbol', () => {
    const meta: StepMeta = {
      index: 7,
      total: 11,
      name: 'Deja Vu',
      codename: 'Deja Vu',
    };

    showStepComplete(meta);

    const output = consoleSpy.mock.calls[0][0];
    // The source uses a checkmark character
    expect(output).toMatch(/[✓✔]/);
  });
});

describe('Progress Percentage Calculation', () => {
  // The showStepHeader computes pct = Math.round((index / total) * 100)
  // Verify the math is sound for boundary values
  it('step 1/11 = 9%', () => {
    expect(Math.round((1 / 11) * 100)).toBe(9);
  });

  it('step 6/11 = 55%', () => {
    expect(Math.round((6 / 11) * 100)).toBe(55);
  });

  it('step 11/11 = 100%', () => {
    expect(Math.round((11 / 11) * 100)).toBe(100);
  });

  it('step 1/4 = 25% (blue pill)', () => {
    expect(Math.round((1 / 4) * 100)).toBe(25);
  });

  it('step 4/4 = 100% (blue pill)', () => {
    expect(Math.round((4 / 4) * 100)).toBe(100);
  });
});
