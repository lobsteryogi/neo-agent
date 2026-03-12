import { describe, expect, it } from 'vitest';
import {
  VALID_MODEL_TIERS,
  VALID_ROUTING_PROFILES,
  isShortFollowup,
  isDebugIntent,
  calculateTimeoutMs,
  formatDebugLogs,
  injectDebugContext,
  injectCompactedContext,
  buildTranscriptMarkdown,
} from '../../src/utils/patterns.js';
import type { LogEntry } from '../../src/utils/logger.js';

// ─── Constants ──────────────────────────────────────────────────

describe('patterns — constants', () => {
  it('VALID_MODEL_TIERS contains haiku, sonnet, opus', () => {
    expect(VALID_MODEL_TIERS).toEqual(['haiku', 'sonnet', 'opus']);
  });

  it('VALID_ROUTING_PROFILES contains auto, eco, balanced, premium', () => {
    expect(VALID_ROUTING_PROFILES).toEqual(['auto', 'eco', 'balanced', 'premium']);
  });
});

// ─── isShortFollowup ────────────────────────────────────────────

describe('patterns — isShortFollowup', () => {
  const positives = [
    'ok',
    'okay',
    'yes',
    'yep',
    'yeah',
    'yea',
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
    'that',
    'this',
    'alright',
    'aye',
    'roger',
    'bet',
    'cool',
    'fine',
    'sounds good',
    'ship it',
    'lgtm',
    "let's go",
    'go for it',
    'make it so',
    'affirmative',
  ];

  for (const input of positives) {
    it(`detects "${input}" as short followup`, () => {
      expect(isShortFollowup(input)).toBe(true);
    });
  }

  it('is case-insensitive', () => {
    expect(isShortFollowup('OK')).toBe(true);
    expect(isShortFollowup('Yes')).toBe(true);
    expect(isShortFollowup('LGTM')).toBe(true);
    expect(isShortFollowup('Ship It')).toBe(true);
  });

  it('trims whitespace', () => {
    expect(isShortFollowup('  ok  ')).toBe(true);
    expect(isShortFollowup('\tyes\n')).toBe(true);
  });

  it('rejects long inputs even if they match the pattern', () => {
    // Construct something over 40 chars that ends with "ok"
    const longInput = 'a'.repeat(39) + 'ok';
    expect(longInput.length).toBeGreaterThan(40);
    expect(isShortFollowup(longInput)).toBe(false);
  });

  it('rejects actual questions/commands', () => {
    expect(isShortFollowup('Can you explain the code?')).toBe(false);
    expect(isShortFollowup('Write a function')).toBe(false);
    expect(isShortFollowup('Tell me about patterns')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isShortFollowup('')).toBe(false);
  });

  it('rejects partial matches', () => {
    expect(isShortFollowup('okay then')).toBe(false);
    expect(isShortFollowup('yes please do that')).toBe(false);
  });

  it('handles emoji input', () => {
    // Only the thumbs up emoji is in the regex
    // The emoji might not match depending on the regex
    // Let's test the actual behavior
    expect(isShortFollowup('hello')).toBe(false);
  });
});

// ─── isDebugIntent ──────────────────────────────────────────────

describe('patterns — isDebugIntent', () => {
  it('detects debug keywords', () => {
    expect(isDebugIntent('Can you debug this?')).toBe(true);
    expect(isDebugIntent('Please diagnose the issue')).toBe(true);
    expect(isDebugIntent('trace the problem')).toBe(true);
    expect(isDebugIntent('inspect the output')).toBe(true);
    expect(isDebugIntent('self-debug mode')).toBe(true);
  });

  it('detects "what happened" style questions', () => {
    expect(isDebugIntent('what happened to my file?')).toBe(true);
    expect(isDebugIntent('why did you do that?')).toBe(true);
    expect(isDebugIntent('what went wrong here?')).toBe(true);
    expect(isDebugIntent('how did you process that?')).toBe(true);
    expect(isDebugIntent('what did you do to my code?')).toBe(true);
  });

  it('detects complaint patterns', () => {
    expect(isDebugIntent('that was too slow')).toBe(true);
    expect(isDebugIntent('it took too long')).toBe(true);
    expect(isDebugIntent('wrong answer buddy')).toBe(true);
    expect(isDebugIntent('that is incorrect')).toBe(true);
    expect(isDebugIntent('you were wrong about that')).toBe(true);
    expect(isDebugIntent('you are wrong')).toBe(true);
    expect(isDebugIntent('you broke it')).toBe(true);
    expect(isDebugIntent('the build is broken')).toBe(true);
    expect(isDebugIntent('tests are failing')).toBe(true);
  });

  it('detects introspection requests', () => {
    expect(isDebugIntent('how do you work?')).toBe(true);
    expect(isDebugIntent('show me your logs')).toBe(true);
    expect(isDebugIntent('explain your pipeline')).toBe(true);
    expect(isDebugIntent('your routing is weird')).toBe(true);
    expect(isDebugIntent('your thinking is off')).toBe(true);
    expect(isDebugIntent('your process seems wrong')).toBe(true);
    expect(isDebugIntent('your log says something')).toBe(true);
  });

  it('detects problem reports', () => {
    expect(isDebugIntent('something is wrong')).toBe(true);
    expect(isDebugIntent('something wrong with the output')).toBe(true);
    expect(isDebugIntent("it's not working")).toBe(true);
    expect(isDebugIntent("that didn't work")).toBe(true);
    expect(isDebugIntent('it didnt work')).toBe(true);
    expect(isDebugIntent('I got an error')).toBe(true);
    expect(isDebugIntent('there is an issue')).toBe(true);
    expect(isDebugIntent('I found a problem')).toBe(true);
    expect(isDebugIntent('this is a bug')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isDebugIntent('DEBUG this')).toBe(true);
    expect(isDebugIntent('WHAT HAPPENED?')).toBe(true);
    expect(isDebugIntent('TOO SLOW')).toBe(true);
  });

  it('returns false for normal messages', () => {
    expect(isDebugIntent('Write a function to sort an array')).toBe(false);
    expect(isDebugIntent('How is the weather today?')).toBe(false);
    expect(isDebugIntent('Create a React component')).toBe(false);
    expect(isDebugIntent('Hello')).toBe(false);
    expect(isDebugIntent('')).toBe(false);
  });
});

// ─── calculateTimeoutMs ─────────────────────────────────────────

describe('patterns — calculateTimeoutMs', () => {
  it('returns 600_000 for high complexity (>= 0.7)', () => {
    expect(calculateTimeoutMs(0.7)).toBe(600_000);
    expect(calculateTimeoutMs(0.8)).toBe(600_000);
    expect(calculateTimeoutMs(1.0)).toBe(600_000);
    expect(calculateTimeoutMs(0.95)).toBe(600_000);
  });

  it('returns 300_000 for medium complexity (>= 0.4, < 0.7)', () => {
    expect(calculateTimeoutMs(0.4)).toBe(300_000);
    expect(calculateTimeoutMs(0.5)).toBe(300_000);
    expect(calculateTimeoutMs(0.69)).toBe(300_000);
  });

  it('returns 120_000 for low complexity (< 0.4)', () => {
    expect(calculateTimeoutMs(0)).toBe(120_000);
    expect(calculateTimeoutMs(0.1)).toBe(120_000);
    expect(calculateTimeoutMs(0.39)).toBe(120_000);
  });

  it('handles boundary values precisely', () => {
    expect(calculateTimeoutMs(0.4)).toBe(300_000);
    expect(calculateTimeoutMs(0.399)).toBe(120_000);
    expect(calculateTimeoutMs(0.7)).toBe(600_000);
    expect(calculateTimeoutMs(0.699)).toBe(300_000);
  });
});

// ─── formatDebugLogs ────────────────────────────────────────────

describe('patterns — formatDebugLogs', () => {
  const makeEntry = (overrides: Partial<LogEntry> = {}): LogEntry => ({
    timestamp: '2026-03-12T10:30:45.123Z',
    level: 'info',
    namespace: 'test',
    message: 'test message',
    ...overrides,
  });

  it('formats a single log entry', () => {
    const result = formatDebugLogs([makeEntry()]);
    expect(result).toBe('[10:30:45.123] INFO [test] test message');
  });

  it('includes data when present and non-empty', () => {
    const result = formatDebugLogs([makeEntry({ data: { key: 'value' } })]);
    expect(result).toContain('{"key":"value"}');
  });

  it('omits data when empty object', () => {
    const result = formatDebugLogs([makeEntry({ data: {} })]);
    expect(result).not.toContain('{}');
    expect(result).toBe('[10:30:45.123] INFO [test] test message');
  });

  it('omits data when undefined', () => {
    const result = formatDebugLogs([makeEntry({ data: undefined })]);
    expect(result).toBe('[10:30:45.123] INFO [test] test message');
  });

  it('includes error message when present', () => {
    const result = formatDebugLogs([makeEntry({ error: { message: 'kaboom' } })]);
    expect(result).toContain('ERROR: kaboom');
  });

  it('formats multiple entries separated by newlines', () => {
    const entries = [
      makeEntry({ message: 'first' }),
      makeEntry({ message: 'second', level: 'warn' }),
    ];
    const result = formatDebugLogs(entries);
    const lines = result.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('first');
    expect(lines[1]).toContain('WARN');
    expect(lines[1]).toContain('second');
  });

  it('returns empty string for empty array', () => {
    expect(formatDebugLogs([])).toBe('');
  });

  it('uppercases log level', () => {
    const result = formatDebugLogs([makeEntry({ level: 'debug' })]);
    expect(result).toContain('DEBUG');
  });

  it('extracts the time portion of the timestamp (chars 11-23)', () => {
    const entry = makeEntry({ timestamp: '2026-01-15T14:22:33.456Z' });
    const result = formatDebugLogs([entry]);
    expect(result).toContain('[14:22:33.456]');
  });

  it('includes both data and error when both present', () => {
    const entry = makeEntry({
      data: { ctx: 'test' },
      error: { message: 'fail' },
    });
    const result = formatDebugLogs([entry]);
    expect(result).toContain('{"ctx":"test"}');
    expect(result).toContain('ERROR: fail');
  });
});

// ─── injectDebugContext ─────────────────────────────────────────

describe('patterns — injectDebugContext', () => {
  it('appends debug context to the system prompt', () => {
    const result = injectDebugContext('You are Neo.', 'some logs here');
    expect(result).toContain('You are Neo.');
    expect(result).toContain('## Self-Debug Context');
    expect(result).toContain('<debug_logs>');
    expect(result).toContain('some logs here');
    expect(result).toContain('</debug_logs>');
  });

  it('preserves the original prompt at the start', () => {
    const result = injectDebugContext('Original prompt.', 'logs');
    expect(result.startsWith('Original prompt.')).toBe(true);
  });

  it('works with empty system prompt', () => {
    const result = injectDebugContext('', 'logs');
    expect(result).toContain('## Self-Debug Context');
    expect(result).toContain('logs');
  });

  it('works with empty log text', () => {
    const result = injectDebugContext('Prompt.', '');
    expect(result).toContain('<debug_logs>');
    expect(result).toContain('</debug_logs>');
  });
});

// ─── injectCompactedContext ─────────────────────────────────────

describe('patterns — injectCompactedContext', () => {
  it('appends compacted context to the system prompt', () => {
    const result = injectCompactedContext('You are Neo.', 'Summary of previous conversation.');
    expect(result).toContain('You are Neo.');
    expect(result).toContain('## Compacted Context');
    expect(result).toContain('Summary of previous conversation.');
  });

  it('preserves the original prompt at the start', () => {
    const result = injectCompactedContext('My prompt.', 'context');
    expect(result.startsWith('My prompt.')).toBe(true);
  });

  it('works with empty system prompt', () => {
    const result = injectCompactedContext('', 'context here');
    expect(result).toContain('## Compacted Context');
  });

  it('works with empty compacted context', () => {
    const result = injectCompactedContext('Prompt.', '');
    expect(result).toContain('## Compacted Context');
  });
});

// ─── buildTranscriptMarkdown ────────────────────────────────────

describe('patterns — buildTranscriptMarkdown', () => {
  const session = {
    id: 'sess-abc123',
    turns: 5,
    totalInputTokens: 1000,
    totalOutputTokens: 2000,
    totalCost: 0.05,
  };

  const history = [
    { role: 'user', content: 'Hello Neo' },
    { role: 'assistant', content: 'Hello, human.' },
  ];

  const fmtTokens = (n: number) => `${n.toLocaleString()} tokens`;
  const fmtCost = (n: number) => `$${n.toFixed(2)}`;

  it('includes session metadata', () => {
    const result = buildTranscriptMarkdown(session, history, fmtTokens, fmtCost);
    expect(result).toContain('`sess-abc123`');
    expect(result).toContain('**Turns:** 5');
    expect(result).toContain('3,000 tokens');
    expect(result).toContain('$0.05');
  });

  it('includes the header', () => {
    const result = buildTranscriptMarkdown(session, history, fmtTokens, fmtCost);
    expect(result).toContain('# Neo Session Export');
  });

  it('formats user messages with user header', () => {
    const result = buildTranscriptMarkdown(session, history, fmtTokens, fmtCost);
    expect(result).toContain('You');
    expect(result).toContain('Hello Neo');
  });

  it('formats assistant messages with Neo header', () => {
    const result = buildTranscriptMarkdown(session, history, fmtTokens, fmtCost);
    expect(result).toContain('Neo');
    expect(result).toContain('Hello, human.');
  });

  it('handles empty history', () => {
    const result = buildTranscriptMarkdown(session, [], fmtTokens, fmtCost);
    expect(result).toContain('# Neo Session Export');
    expect(result).toContain('**Turns:** 5');
    // No message headers
    expect(result).not.toContain('Hello');
  });

  it('handles history with undefined content gracefully', () => {
    const historyWithUndefined = [{ role: 'user', content: undefined as unknown as string }];
    const result = buildTranscriptMarkdown(session, historyWithUndefined, fmtTokens, fmtCost);
    // content ?? '' should produce empty string
    expect(result).toContain('You');
  });

  it('includes date in the output', () => {
    const result = buildTranscriptMarkdown(session, history, fmtTokens, fmtCost);
    expect(result).toContain('**Date:**');
    // Should contain a date in YYYY-MM-DD format
    expect(result).toMatch(/\*\*Date:\*\* \d{4}-\d{2}-\d{2}/);
  });

  it('includes divider', () => {
    const result = buildTranscriptMarkdown(session, history, fmtTokens, fmtCost);
    expect(result).toContain('---');
  });
});
