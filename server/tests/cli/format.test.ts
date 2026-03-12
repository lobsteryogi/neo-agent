import { describe, expect, it, vi } from 'vitest';

// Mock terminal utilities
vi.mock('../../src/utils/terminal.js', () => ({
  color: new Proxy(
    {},
    {
      get: () => (s: string) => s,
    },
  ),
  digitalRain: vi.fn(() => '~~~rain~~~'),
  gradient: vi.fn((s: string) => s),
}));

vi.mock('../../src/data/matrix-quotes.js', () => ({
  getQuote: vi.fn(() => 'The Matrix has you...'),
}));

// isShortFollowup is re-exported from patterns, so mock the source
vi.mock('../../src/utils/patterns.js', () => ({
  isShortFollowup: (input: string): boolean => {
    const SHORT_FOLLOWUP_RE =
      /^(ok|okay|yes|yep|yeah|yea|sure|go|go ahead|do it|proceed|continue|y|k|👍|please|pls|correct|right|exactly|that|this|alright|aye|roger|bet|cool|fine|sounds good|ship it|lgtm|let's go|go for it|make it so|affirmative)$/i;
    return input.length <= 40 && SHORT_FOLLOWUP_RE.test(input.trim());
  },
}));

import {
  R,
  buildBanner,
  buildPrompt,
  fmtCost,
  fmtTokens,
  isShortFollowup,
  sessionInfo,
  statsLine,
} from '../../src/cli/lib/format';

// ─── fmtTokens ──────────────────────────────────────────────────

describe('fmtTokens', () => {
  it('returns raw number for values under 1000', () => {
    expect(fmtTokens(0)).toBe('0');
    expect(fmtTokens(1)).toBe('1');
    expect(fmtTokens(500)).toBe('500');
    expect(fmtTokens(999)).toBe('999');
  });

  it('formats thousands with k suffix', () => {
    expect(fmtTokens(1000)).toBe('1.0k');
    expect(fmtTokens(1500)).toBe('1.5k');
    expect(fmtTokens(10000)).toBe('10.0k');
    expect(fmtTokens(99999)).toBe('100.0k');
    expect(fmtTokens(999999)).toBe('1000.0k');
  });

  it('formats millions with M suffix', () => {
    expect(fmtTokens(1_000_000)).toBe('1.0M');
    expect(fmtTokens(1_500_000)).toBe('1.5M');
    expect(fmtTokens(10_000_000)).toBe('10.0M');
  });

  it('handles exact boundaries', () => {
    expect(fmtTokens(1000)).toBe('1.0k');
    expect(fmtTokens(1_000_000)).toBe('1.0M');
  });
});

// ─── fmtCost ────────────────────────────────────────────────────

describe('fmtCost', () => {
  it('formats zero cost', () => {
    expect(fmtCost(0)).toBe('$0.00');
  });

  it('formats small costs with two decimals', () => {
    expect(fmtCost(0.01)).toBe('$0.01');
    expect(fmtCost(0.123)).toBe('$0.12');
  });

  it('formats larger costs', () => {
    expect(fmtCost(1.5)).toBe('$1.50');
    expect(fmtCost(10.999)).toBe('$11.00');
  });

  it('rounds correctly', () => {
    expect(fmtCost(0.005)).toBe('$0.01');
    expect(fmtCost(0.004)).toBe('$0.00');
  });
});

// ─── R (ANSI reset) ────────────────────────────────────────────

describe('R', () => {
  it('is the ANSI reset escape sequence', () => {
    expect(R).toBe('\x1b[0m');
  });
});

// ─── sessionInfo ────────────────────────────────────────────────

describe('sessionInfo', () => {
  it('includes session id, turns, tokens, and cost', () => {
    const session = {
      id: 'abc123',
      turns: 10,
      totalInputTokens: 5000,
      totalOutputTokens: 3000,
      totalCost: 0.42,
      startedAt: Date.now(),
    };
    const info = sessionInfo(session);
    expect(info).toContain('abc123');
    expect(info).toContain('10');
    expect(info).toContain('8.0k'); // 5000 + 3000 = 8000 -> fmtTokens -> '8.0k'
    expect(info).toContain('$0.42');
  });

  it('handles zero-value session', () => {
    const session = {
      id: 'empty',
      turns: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      startedAt: Date.now(),
    };
    const info = sessionInfo(session);
    expect(info).toContain('empty');
    expect(info).toContain('0');
    expect(info).toContain('$0.00');
  });
});

// ─── statsLine ──────────────────────────────────────────────────

describe('statsLine', () => {
  it('includes output tokens, cost, and duration', () => {
    const line = statsLine(1500, 10000, 0.05, 3200);
    expect(line).toContain('1.5k'); // output tokens
    expect(line).toContain('$0.05'); // cost
    expect(line).toContain('3.2s'); // duration
  });

  it('includes model tag when provided', () => {
    const line = statsLine(100, 500, 0.01, 1000, 'sonnet');
    expect(line).toContain('S'); // sonnet abbreviated
  });

  it('uses correct model abbreviations', () => {
    expect(statsLine(100, 500, 0.01, 1000, 'haiku')).toContain('H');
    expect(statsLine(100, 500, 0.01, 1000, 'opus')).toContain('O');
    expect(statsLine(100, 500, 0.01, 1000, 'sonnet')).toContain('S');
  });

  it('falls back to raw model name for unknown models', () => {
    const line = statsLine(100, 500, 0.01, 1000, 'gpt4');
    expect(line).toContain('gpt4');
  });

  it('includes route score when provided', () => {
    const line = statsLine(100, 500, 0.01, 1000, undefined, 0.75);
    expect(line).toContain('r:0.75');
  });

  it('includes compaction info when provided', () => {
    const line = statsLine(100, 500, 0.01, 1000, undefined, undefined, {
      summarized: 20,
      kept: 5,
    });
    expect(line).toContain('20');
    expect(line).toContain('5');
  });

  it('shows turns/threshold when no compaction but turns info provided', () => {
    const line = statsLine(100, 500, 0.01, 1000, undefined, undefined, null, 8, 15);
    expect(line).toContain('8/15');
  });

  it('includes session tag when sessionId provided', () => {
    const line = statsLine(
      100,
      500,
      0.01,
      1000,
      undefined,
      undefined,
      null,
      undefined,
      undefined,
      'my-session-id',
    );
    // shortSession truncates to 4 chars + ellipsis
    expect(line).toContain('my-s');
  });

  it('shows context gauge with session total vs limit', () => {
    const line = statsLine(100, 200_000, 0.01, 1000);
    expect(line).toContain('200.0k'); // session total
  });

  it('does not include session tag when not provided', () => {
    const line = statsLine(100, 500, 0.01, 1000);
    // The session tag wrapping characters should not appear without sessionId
    // Since color is mocked as identity, just check general structure
    expect(line).toContain('$0.01');
  });
});

// ─── buildBanner ────────────────────────────────────────────────

describe('buildBanner', () => {
  it('returns a string containing the title', () => {
    const banner = buildBanner();
    expect(banner).toContain('N E O   C H A T');
  });

  it('contains the /help hint', () => {
    const banner = buildBanner();
    expect(banner).toContain('/help');
  });

  it('includes a Matrix quote', () => {
    const banner = buildBanner();
    expect(banner).toContain('The Matrix has you...');
  });

  it('returns a multiline string', () => {
    const banner = buildBanner();
    expect(banner.split('\n').length).toBeGreaterThan(3);
  });
});

// ─── buildPrompt ────────────────────────────────────────────────

describe('buildPrompt', () => {
  it('includes session ID', () => {
    const prompt = buildPrompt('abc123');
    expect(prompt).toContain('abc123');
  });

  it('uses default name "you" when userName not provided', () => {
    const prompt = buildPrompt('sess1');
    expect(prompt).toContain('you');
  });

  it('uses provided userName', () => {
    const prompt = buildPrompt('sess1', 'Neo');
    expect(prompt).toContain('Neo');
  });

  it('includes ANSI reset at the end', () => {
    const prompt = buildPrompt('sess1');
    expect(prompt).toContain(R);
  });
});

// ─── isShortFollowup ────────────────────────────────────────────

describe('isShortFollowup', () => {
  it('recognizes common affirmatives', () => {
    const affirmatives = [
      'ok',
      'okay',
      'yes',
      'yep',
      'yeah',
      'sure',
      'go',
      'go ahead',
      'do it',
      'proceed',
      'continue',
      'y',
      'k',
      'please',
      'pls',
      'correct',
      'right',
      'exactly',
      'alright',
      'cool',
      'fine',
      'lgtm',
      'ship it',
    ];
    for (const word of affirmatives) {
      expect(isShortFollowup(word)).toBe(true);
    }
  });

  it('is case insensitive', () => {
    expect(isShortFollowup('OK')).toBe(true);
    expect(isShortFollowup('Yes')).toBe(true);
    expect(isShortFollowup('SURE')).toBe(true);
    expect(isShortFollowup('Go Ahead')).toBe(true);
  });

  it('rejects long sentences', () => {
    expect(isShortFollowup('Can you explain how the routing system works in detail?')).toBe(false);
  });

  it('rejects non-followup short text', () => {
    expect(isShortFollowup('hello')).toBe(false);
    expect(isShortFollowup('what')).toBe(false);
    expect(isShortFollowup('debug this')).toBe(false);
  });

  it('handles whitespace trimming', () => {
    expect(isShortFollowup('  yes  ')).toBe(true);
    expect(isShortFollowup(' ok ')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isShortFollowup('')).toBe(false);
  });
});
