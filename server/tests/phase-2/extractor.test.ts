import { describe, expect, it } from 'vitest';
import { MemoryExtractor } from '../../src/memory/extractor';

describe('MemoryExtractor', () => {
  const extractor = new MemoryExtractor();

  it('extracts preference from "I prefer" pattern', () => {
    const entries = extractor.extractFromMessage('I prefer TypeScript over JavaScript', 's1');
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('preference');
    expect(entries[0].importance).toBeGreaterThan(0.5);
  });

  it('extracts decision from "decided" pattern', () => {
    const entries = extractor.extractFromMessage('I decided to use SQLite for this project', 's1');
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('decision');
  });

  it('extracts fact from "remember that" pattern', () => {
    const entries = extractor.extractFromMessage(
      'Remember that the API key is stored in .env',
      's1',
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('fact');
    expect(entries[0].importance).toBe(0.9);
  });

  it('extracts correction from "actually" pattern', () => {
    const entries = extractor.extractFromMessage(
      'Actually, the port should be 3000 not 3141',
      's1',
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('correction');
  });

  it('extracts learning from "turns out" pattern', () => {
    const entries = extractor.extractFromMessage('Turns out FTS5 needs explicit triggers', 's1');
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('learning');
  });

  it('extracts only one entry per type per message', () => {
    const entries = extractor.extractFromMessage(
      'I prefer dark mode. I always use dark themes.',
      's1',
    );
    const prefs = entries.filter((e) => e.type === 'preference');
    expect(prefs).toHaveLength(1);
  });

  it('returns empty array for messages with no patterns', () => {
    const entries = extractor.extractFromMessage('Hello, how are you?', 's1');
    expect(entries).toHaveLength(0);
  });

  it('auto-tags tech keywords', () => {
    const entries = extractor.extractFromMessage('I prefer using TypeScript with React', 's1');
    expect(entries[0].tags).toContain('typescript');
    expect(entries[0].tags).toContain('react');
  });

  it('truncates long messages to 500 chars', () => {
    const longMsg = 'I prefer ' + 'x'.repeat(600);
    const entries = extractor.extractFromMessage(longMsg, 's1');
    expect(entries[0].content.length).toBeLessThanOrEqual(500);
  });

  it('sets sourceSession correctly', () => {
    const entries = extractor.extractFromMessage('I decided to go with pnpm', 'my-session-42');
    expect(entries[0].sourceSession).toBe('my-session-42');
  });
});
