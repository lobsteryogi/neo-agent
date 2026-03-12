import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  rgb,
  bgRgb,
  color,
  gradient,
  getSpinnerFrame,
  digitalRain,
  matrixBox,
  matrixProgress,
  sectionHeader,
  status,
  sleep,
  NEO_BANNER,
  WAKE_UP_ART,
  MATRIX_DIVIDER,
  MATRIX_DIVIDER_LONG,
} from '../../src/utils/terminal.js';

const RESET = '\x1b[0m';

// Helper to strip ANSI escape codes for content verification
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

// ─── rgb / bgRgb ──────────────────────────────────────────────────

describe('terminal — rgb', () => {
  it('returns a function', () => {
    const fn = rgb(255, 0, 0);
    expect(typeof fn).toBe('function');
  });

  it('wraps text with 24-bit foreground color codes', () => {
    const red = rgb(255, 0, 0);
    const result = red('hello');
    expect(result).toBe(`\x1b[38;2;255;0;0mhello${RESET}`);
  });

  it('handles zero values', () => {
    const black = rgb(0, 0, 0);
    expect(black('x')).toBe(`\x1b[38;2;0;0;0mx${RESET}`);
  });

  it('handles max values', () => {
    const white = rgb(255, 255, 255);
    expect(white('y')).toBe(`\x1b[38;2;255;255;255my${RESET}`);
  });

  it('handles empty string', () => {
    const fn = rgb(100, 100, 100);
    expect(fn('')).toBe(`\x1b[38;2;100;100;100m${RESET}`);
  });
});

describe('terminal — bgRgb', () => {
  it('returns a function', () => {
    const fn = bgRgb(0, 128, 255);
    expect(typeof fn).toBe('function');
  });

  it('wraps text with 24-bit background color codes', () => {
    const fn = bgRgb(0, 128, 255);
    const result = fn('bg');
    expect(result).toBe(`\x1b[48;2;0;128;255mbg${RESET}`);
  });
});

// ─── color object ─────────────────────────────────────────────────

describe('terminal — color', () => {
  it('has all expected color functions', () => {
    const expected = [
      'green',
      'brightGreen',
      'darkGreen',
      'cyan',
      'yellow',
      'red',
      'white',
      'dim',
      'bold',
      'italic',
      'underline',
      'matrix',
      'phosphor',
      'darkPhosphor',
      'amber',
      'neonCyan',
      'magenta',
      'electricBlue',
      'hotPink',
      'neonPurple',
      'neonYellow',
      'dimCyan',
    ];
    for (const name of expected) {
      expect(typeof (color as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('each color function wraps text with ANSI codes and RESET', () => {
    for (const [name, fn] of Object.entries(color)) {
      const result = fn('test');
      expect(result).toContain('test');
      expect(result).toContain(RESET);
      expect(result.startsWith('\x1b[')).toBe(true);
    }
  });

  it('green wraps with correct code', () => {
    expect(color.green('hi')).toBe(`\x1b[32mhi${RESET}`);
  });

  it('bold wraps with correct code', () => {
    expect(color.bold('strong')).toBe(`\x1b[1mstrong${RESET}`);
  });

  it('dim wraps with correct code', () => {
    expect(color.dim('faded')).toBe(`\x1b[2mfaded${RESET}`);
  });

  it('red wraps with correct code', () => {
    expect(color.red('danger')).toBe(`\x1b[31mdanger${RESET}`);
  });
});

// ─── gradient ─────────────────────────────────────────────────────

describe('terminal — gradient', () => {
  it('returns empty string for empty text', () => {
    expect(gradient('', [255, 0, 0], [0, 0, 255])).toBe('');
  });

  it('colors single character with "from" color', () => {
    const result = gradient('A', [255, 0, 0], [0, 0, 255]);
    expect(result).toContain('38;2;255;0;0');
    expect(result).toContain('A');
  });

  it('starts with "from" color and ends with "to" color for multi-char', () => {
    const result = gradient('AB', [255, 0, 0], [0, 0, 255]);
    expect(result).toContain('38;2;255;0;0');
    expect(result).toContain('38;2;0;0;255');
    expect(result).toContain(RESET);
  });

  it('produces correct number of color segments', () => {
    const text = 'ABCDE';
    const result = gradient(text, [0, 0, 0], [100, 100, 100]);
    // Each character should have its own color escape
    const matches = result.match(/\x1b\[38;2;\d+;\d+;\d+m/g);
    expect(matches).toHaveLength(5);
  });

  it('interpolates colors correctly at midpoint', () => {
    // From [0,0,0] to [100,0,0] with 3 chars: midpoint should be [50,0,0]
    const result = gradient('ABC', [0, 0, 0], [100, 0, 0]);
    expect(result).toContain('38;2;50;0;0');
  });
});

// ─── getSpinnerFrame ──────────────────────────────────────────────

describe('terminal — getSpinnerFrame', () => {
  it('returns a string for index 0', () => {
    const frame = getSpinnerFrame(0);
    expect(typeof frame).toBe('string');
    expect(frame.length).toBeGreaterThan(0);
  });

  it('cycles through different frames', () => {
    const frame0 = getSpinnerFrame(0);
    const frame1 = getSpinnerFrame(1);
    // They should differ (different character and/or color)
    expect(frame0).not.toBe(frame1);
  });

  it('wraps around without error for large indices', () => {
    expect(() => getSpinnerFrame(1000)).not.toThrow();
    expect(typeof getSpinnerFrame(1000)).toBe('string');
  });

  it('contains ANSI color codes', () => {
    const frame = getSpinnerFrame(0);
    expect(frame).toContain('\x1b[');
  });
});

// ─── digitalRain ──────────────────────────────────────────────────

describe('terminal — digitalRain', () => {
  it('returns the specified number of lines', () => {
    const result = digitalRain(3, 10);
    const lines = result.split('\n');
    expect(lines).toHaveLength(3);
  });

  it('defaults to 4 lines', () => {
    const result = digitalRain();
    const lines = result.split('\n');
    expect(lines).toHaveLength(4);
  });

  it('each line starts with two spaces', () => {
    const result = digitalRain(2, 5);
    const lines = result.split('\n');
    for (const line of lines) {
      expect(line.startsWith('  ')).toBe(true);
    }
  });

  it('contains ANSI color codes', () => {
    const result = digitalRain(1, 20);
    expect(result).toContain('\x1b[');
  });

  it('produces output with content (not just whitespace)', () => {
    const result = digitalRain(1, 10);
    const stripped = stripAnsi(result).trim();
    expect(stripped.length).toBeGreaterThan(0);
  });
});

// ─── matrixBox ────────────────────────────────────────────────────

describe('terminal — matrixBox', () => {
  it('includes the title', () => {
    const result = matrixBox('My Title', ['line 1', 'line 2']);
    expect(stripAnsi(result)).toContain('My Title');
  });

  it('includes content lines', () => {
    const result = matrixBox('Title', ['content A', 'content B']);
    const stripped = stripAnsi(result);
    expect(stripped).toContain('content A');
    expect(stripped).toContain('content B');
  });

  it('uses box-drawing characters', () => {
    const result = matrixBox('Box', ['data']);
    const stripped = stripAnsi(result);
    expect(stripped).toContain('┌');
    expect(stripped).toContain('┐');
    expect(stripped).toContain('└');
    expect(stripped).toContain('┘');
    expect(stripped).toContain('│');
    expect(stripped).toContain('├');
    expect(stripped).toContain('┤');
  });

  it('has minimum width of 40', () => {
    const result = matrixBox('X', ['Y']);
    const stripped = stripAnsi(result);
    // The top line should have at least 40 dashes plus borders
    const topLine = stripped.split('\n')[0];
    const dashes = (topLine.match(/─/g) || []).length;
    expect(dashes).toBeGreaterThanOrEqual(40);
  });

  it('defaults to info style', () => {
    // Just checking it doesn't throw for default style
    const result = matrixBox('Info', ['content']);
    expect(result.length).toBeGreaterThan(0);
  });

  it('accepts all style variants without error', () => {
    const styles: Array<'success' | 'warning' | 'error' | 'info'> = [
      'success',
      'warning',
      'error',
      'info',
    ];
    for (const style of styles) {
      expect(() => matrixBox('Title', ['content'], style)).not.toThrow();
    }
  });

  it('handles empty content array', () => {
    const result = matrixBox('Empty', []);
    expect(stripAnsi(result)).toContain('Empty');
  });
});

// ─── matrixProgress ───────────────────────────────────────────────

describe('terminal — matrixProgress', () => {
  it('shows 0% for 0 progress', () => {
    const result = matrixProgress('Loading', 0, 100);
    expect(stripAnsi(result)).toContain('0%');
  });

  it('shows 100% for complete progress', () => {
    const result = matrixProgress('Loading', 100, 100);
    expect(stripAnsi(result)).toContain('100%');
  });

  it('shows 50% at halfway', () => {
    const result = matrixProgress('Loading', 50, 100);
    expect(stripAnsi(result)).toContain('50%');
  });

  it('includes the label', () => {
    const result = matrixProgress('Downloading', 30, 100);
    expect(stripAnsi(result)).toContain('Downloading');
  });

  it('contains progress bar characters', () => {
    const stripped = stripAnsi(matrixProgress('Test', 50, 100));
    expect(stripped).toContain('[');
    expect(stripped).toContain(']');
  });
});

// ─── sectionHeader ────────────────────────────────────────────────

describe('terminal — sectionHeader', () => {
  it('includes the title text', () => {
    const result = sectionHeader('Configuration');
    expect(stripAnsi(result)).toContain('Configuration');
  });

  it('includes the arrow marker', () => {
    const result = sectionHeader('Test');
    expect(stripAnsi(result)).toContain('\u25B8'); // ▸
  });
});

// ─── status indicators ───────────────────────────────────────────

describe('terminal — status', () => {
  it('ok includes the message', () => {
    expect(stripAnsi(status.ok('All good'))).toContain('All good');
  });

  it('warn includes the message', () => {
    expect(stripAnsi(status.warn('Careful'))).toContain('Careful');
  });

  it('fail includes the message', () => {
    expect(stripAnsi(status.fail('Broken'))).toContain('Broken');
  });

  it('info includes the message', () => {
    expect(stripAnsi(status.info('Notice'))).toContain('Notice');
  });

  it('step includes the step number and message', () => {
    const result = stripAnsi(status.step(3, 'Install deps'));
    expect(result).toContain('[3]');
    expect(result).toContain('Install deps');
  });
});

// ─── sleep ────────────────────────────────────────────────────────

describe('terminal — sleep', () => {
  it('returns a promise', () => {
    const result = sleep(0);
    expect(result).toBeInstanceOf(Promise);
  });

  it('resolves after the given time', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40); // Allow small timing variance
  });

  it('resolves to undefined', async () => {
    const result = await sleep(0);
    expect(result).toBeUndefined();
  });
});

// ─── Exported constants ───────────────────────────────────────────

describe('terminal — constants', () => {
  it('NEO_BANNER is a non-empty string', () => {
    expect(typeof NEO_BANNER).toBe('string');
    expect(NEO_BANNER.length).toBeGreaterThan(0);
  });

  it('WAKE_UP_ART is a non-empty string', () => {
    expect(typeof WAKE_UP_ART).toBe('string');
    expect(WAKE_UP_ART.length).toBeGreaterThan(0);
  });

  it('MATRIX_DIVIDER is a non-empty string', () => {
    expect(typeof MATRIX_DIVIDER).toBe('string');
    expect(MATRIX_DIVIDER.length).toBeGreaterThan(0);
  });

  it('MATRIX_DIVIDER_LONG is longer than MATRIX_DIVIDER', () => {
    expect(stripAnsi(MATRIX_DIVIDER_LONG).length).toBeGreaterThan(stripAnsi(MATRIX_DIVIDER).length);
  });
});
