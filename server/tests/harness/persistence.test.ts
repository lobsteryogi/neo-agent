import { describe, expect, it, vi } from 'vitest';
import { PersistenceProtocol } from '../../src/harness/persistence';

describe('PersistenceProtocol (Retry Logic)', () => {
  it('has the correct wrapper name', () => {
    const pp = new PersistenceProtocol();
    expect(pp.name).toBe('PersistenceProtocol');
  });

  // ─── process() ──────────────────────────────────────────────

  it('attaches _persistence metadata with defaults', async () => {
    const pp = new PersistenceProtocol();
    const result = await pp.process({ content: 'test' });

    expect(result._persistence).toEqual({
      maxRetries: 3,
      baseDelayMs: 100,
    });
  });

  it('uses custom maxRetries and baseDelayMs', async () => {
    const pp = new PersistenceProtocol(5, 200);
    const result = await pp.process({ content: 'test' });

    expect(result._persistence).toEqual({
      maxRetries: 5,
      baseDelayMs: 200,
    });
  });

  it('preserves original response fields', async () => {
    const pp = new PersistenceProtocol();
    const response = { content: 'hello', model: 'sonnet' as const };
    const result = await pp.process(response);

    expect(result.content).toBe('hello');
    expect(result.model).toBe('sonnet');
  });

  // ─── withRetry() ────────────────────────────────────────────

  it('returns immediately on first success', async () => {
    const pp = new PersistenceProtocol(3, 1);
    const fn = vi.fn().mockResolvedValue('done');

    const result = await pp.withRetry(fn);
    expect(result).toBe('done');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on transient sqlite_busy error', async () => {
    const pp = new PersistenceProtocol(3, 1);
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('SQLITE_BUSY: database is busy'))
      .mockResolvedValue('recovered');

    const result = await pp.withRetry(fn);
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on transient "database is locked" error', async () => {
    const pp = new PersistenceProtocol(3, 1);
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('database is locked'))
      .mockResolvedValue('ok');

    const result = await pp.withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on transient ECONNRESET error', async () => {
    const pp = new PersistenceProtocol(3, 1);
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('read ECONNRESET'))
      .mockResolvedValue('reconnected');

    const result = await pp.withRetry(fn);
    expect(result).toBe('reconnected');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on transient timeout error', async () => {
    const pp = new PersistenceProtocol(3, 1);
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Request timeout'))
      .mockResolvedValue('made it');

    const result = await pp.withRetry(fn);
    expect(result).toBe('made it');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry non-transient errors', async () => {
    const pp = new PersistenceProtocol(3, 1);
    const fn = vi.fn().mockRejectedValue(new Error('Permission denied'));

    await expect(pp.withRetry(fn)).rejects.toThrow('Permission denied');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws after exhausting all retries on transient errors', async () => {
    const pp = new PersistenceProtocol(3, 1);
    const fn = vi.fn().mockRejectedValue(new Error('SQLITE_BUSY forever'));

    await expect(pp.withRetry(fn)).rejects.toThrow('SQLITE_BUSY forever');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('converts non-Error thrown values to Error', async () => {
    const pp = new PersistenceProtocol(3, 1);
    const fn = vi.fn().mockRejectedValue('string error');

    await expect(pp.withRetry(fn)).rejects.toThrow('string error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('uses exponential backoff (increasing delays)', async () => {
    const pp = new PersistenceProtocol(3, 10);
    const timestamps: number[] = [];

    const fn = vi.fn().mockImplementation(async () => {
      timestamps.push(Date.now());
      if (timestamps.length < 3) {
        throw new Error('timeout please retry');
      }
      return 'done';
    });

    await pp.withRetry(fn);

    expect(timestamps).toHaveLength(3);
    // Second attempt should wait ~10ms (baseDelay * 2^0)
    // Third attempt should wait ~20ms (baseDelay * 2^1)
    const delay1 = timestamps[1] - timestamps[0];
    const delay2 = timestamps[2] - timestamps[1];
    // Delay2 should be roughly 2x delay1 (with some tolerance for timing)
    expect(delay2).toBeGreaterThanOrEqual(delay1 * 0.5);
  });

  it('succeeds on the last retry attempt', async () => {
    const pp = new PersistenceProtocol(3, 1);
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue('phew');

    const result = await pp.withRetry(fn);
    expect(result).toBe('phew');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
