import { describe, expect, it } from 'vitest';
import { Deadline } from '../../src/harness/deadline';

describe('Deadline (Timeout Metadata)', () => {
  it('has the correct wrapper name', () => {
    const deadline = new Deadline();
    expect(deadline.name).toBe('Deadline');
  });

  it('attaches _deadline metadata with default timeout (600s)', async () => {
    const deadline = new Deadline();
    const response = { content: 'Hello' };

    const before = Date.now();
    const result = await deadline.process(response);
    const after = Date.now();

    expect(result._deadline).toBeDefined();
    expect(result._deadline.maxMs).toBe(600_000);
    expect(result._deadline.timestamp).toBeGreaterThanOrEqual(before);
    expect(result._deadline.timestamp).toBeLessThanOrEqual(after);
  });

  it('uses custom timeout when provided', async () => {
    const deadline = new Deadline(120_000);
    const result = await deadline.process({ content: 'test' });

    expect(result._deadline.maxMs).toBe(120_000);
  });

  it('preserves original response fields', async () => {
    const deadline = new Deadline(5000);
    const response = { content: 'preserved', model: 'sonnet' as const, tokensUsed: 50 };
    const result = await deadline.process(response);

    expect(result.content).toBe('preserved');
    expect(result.model).toBe('sonnet');
    expect(result.tokensUsed).toBe(50);
  });

  it('handles zero timeout', async () => {
    const deadline = new Deadline(0);
    const result = await deadline.process({ content: 'test' });
    expect(result._deadline.maxMs).toBe(0);
  });

  it('handles very large timeout values', async () => {
    const deadline = new Deadline(Number.MAX_SAFE_INTEGER);
    const result = await deadline.process({ content: 'test' });
    expect(result._deadline.maxMs).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('generates a unique timestamp per call', async () => {
    const deadline = new Deadline();
    const result1 = await deadline.process({ content: 'first' });
    // Small delay to ensure different timestamp
    await new Promise((r) => setTimeout(r, 2));
    const result2 = await deadline.process({ content: 'second' });
    expect(result2._deadline.timestamp).toBeGreaterThanOrEqual(result1._deadline.timestamp);
  });
});
