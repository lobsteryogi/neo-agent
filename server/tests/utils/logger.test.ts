import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  logger,
  getRecentLogs,
  clearRecentLogs,
  setLogLevel,
  getLogLevel,
  LEVEL_COLORS,
  type LogLevel,
  type LogEntry,
} from '../../src/utils/logger.js';

describe('logger', () => {
  beforeEach(() => {
    clearRecentLogs();
    // Suppress console output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Logger Factory ─────────────────────────────────────────────

  describe('logger factory', () => {
    it('creates a logger with info, debug, warn, error methods', () => {
      const log = logger('test');
      expect(typeof log.info).toBe('function');
      expect(typeof log.debug).toBe('function');
      expect(typeof log.warn).toBe('function');
      expect(typeof log.error).toBe('function');
    });

    it('records the namespace on log entries', () => {
      const log = logger('my-module');
      log.info('test message');
      const entries = getRecentLogs();
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[entries.length - 1].namespace).toBe('my-module');
    });

    it('records the level on log entries', () => {
      const log = logger('test');
      log.info('info msg');
      log.warn('warn msg');
      log.debug('debug msg');
      log.error('error msg');
      const entries = getRecentLogs();
      const levels = entries.map((e) => e.level);
      expect(levels).toContain('info');
      expect(levels).toContain('warn');
      expect(levels).toContain('debug');
      expect(levels).toContain('error');
    });
  });

  // ─── Ring Buffer ────────────────────────────────────────────────

  describe('ring buffer (getRecentLogs / clearRecentLogs)', () => {
    it('stores log entries in the ring buffer', () => {
      const log = logger('ring-test');
      log.info('first');
      log.info('second');
      const entries = getRecentLogs();
      expect(entries.length).toBe(2);
      expect(entries[0].message).toBe('first');
      expect(entries[1].message).toBe('second');
    });

    it('clears all entries when clearRecentLogs is called', () => {
      const log = logger('clear-test');
      log.info('will be cleared');
      expect(getRecentLogs().length).toBe(1);
      clearRecentLogs();
      expect(getRecentLogs().length).toBe(0);
    });

    it('returns entries in chronological order', () => {
      const log = logger('order-test');
      log.info('msg-1');
      log.info('msg-2');
      log.info('msg-3');
      const entries = getRecentLogs();
      expect(entries.map((e) => e.message)).toEqual(['msg-1', 'msg-2', 'msg-3']);
    });

    it('limits entries by count parameter', () => {
      const log = logger('count-test');
      log.info('a');
      log.info('b');
      log.info('c');
      log.info('d');
      const entries = getRecentLogs(2);
      expect(entries.length).toBe(2);
      expect(entries[0].message).toBe('c');
      expect(entries[1].message).toBe('d');
    });

    it('filters entries by namespace', () => {
      const log1 = logger('module-a');
      const log2 = logger('module-b');
      log1.info('from a');
      log2.info('from b');
      log1.info('also from a');

      const aEntries = getRecentLogs(undefined, 'module-a');
      expect(aEntries.length).toBe(2);
      expect(aEntries.every((e) => e.namespace === 'module-a')).toBe(true);

      const bEntries = getRecentLogs(undefined, 'module-b');
      expect(bEntries.length).toBe(1);
      expect(bEntries[0].message).toBe('from b');
    });

    it('applies both count and namespace filter', () => {
      const log = logger('combo-test');
      log.info('a');
      log.info('b');
      log.info('c');
      const entries = getRecentLogs(1, 'combo-test');
      expect(entries.length).toBe(1);
      expect(entries[0].message).toBe('c');
    });

    it('returns empty array when namespace does not match', () => {
      const log = logger('exists');
      log.info('hello');
      const entries = getRecentLogs(undefined, 'does-not-exist');
      expect(entries).toEqual([]);
    });

    it('wraps around when ring buffer is full', () => {
      const log = logger('overflow');
      // Ring buffer size is 200, fill it and go past
      for (let i = 0; i < 210; i++) {
        log.info(`msg-${i}`);
      }
      const entries = getRecentLogs();
      // Should have 200 entries (ring buffer size)
      expect(entries.length).toBe(200);
      // Oldest should be msg-10, newest should be msg-209
      expect(entries[0].message).toBe('msg-10');
      expect(entries[entries.length - 1].message).toBe('msg-209');
    });
  });

  // ─── Data and Error Handling ────────────────────────────────────

  describe('data and error handling', () => {
    it('attaches data to log entries', () => {
      const log = logger('data-test');
      log.info('with data', { key: 'value', count: 42 });
      const entry = getRecentLogs(1)[0];
      expect(entry.data).toEqual({ key: 'value', count: 42 });
    });

    it('attaches error details when Error is passed', () => {
      const log = logger('error-test');
      const err = new Error('test error');
      log.error('something failed', err);
      const entry = getRecentLogs(1)[0];
      expect(entry.error).toBeDefined();
      expect(entry.error!.message).toBe('test error');
      expect(entry.error!.stack).toBeDefined();
      expect(entry.data).toBeUndefined();
    });

    it('attaches data (not error) when object is passed to error()', () => {
      const log = logger('error-data-test');
      log.error('with data', { context: 'details' });
      const entry = getRecentLogs(1)[0];
      expect(entry.data).toEqual({ context: 'details' });
      expect(entry.error).toBeUndefined();
    });

    it('handles error() with no extra argument', () => {
      const log = logger('error-bare');
      log.error('bare error');
      const entry = getRecentLogs(1)[0];
      expect(entry.message).toBe('bare error');
      expect(entry.data).toBeUndefined();
      expect(entry.error).toBeUndefined();
    });
  });

  // ─── Timestamps ─────────────────────────────────────────────────

  describe('timestamps', () => {
    it('entries have ISO timestamp', () => {
      const log = logger('ts-test');
      log.info('timestamped');
      const entry = getRecentLogs(1)[0];
      expect(entry.timestamp).toBeDefined();
      // Should be a valid ISO date string
      expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
    });
  });

  // ─── Log Level Control ──────────────────────────────────────────

  describe('setLogLevel / getLogLevel', () => {
    let originalLevel: LogLevel;

    beforeEach(() => {
      originalLevel = getLogLevel();
    });

    afterEach(() => {
      setLogLevel(originalLevel);
    });

    it('returns the current log level', () => {
      const level = getLogLevel();
      expect(['debug', 'info', 'warn', 'error']).toContain(level);
    });

    it('changes the log level', () => {
      setLogLevel('error');
      expect(getLogLevel()).toBe('error');
      setLogLevel('debug');
      expect(getLogLevel()).toBe('debug');
    });

    it('debug messages still go to ring buffer regardless of level', () => {
      setLogLevel('error');
      const log = logger('level-test');
      log.debug('should still be in ring buffer');
      const entries = getRecentLogs();
      expect(entries.some((e) => e.message === 'should still be in ring buffer')).toBe(true);
    });

    it('console.log is not called for messages below min level', () => {
      setLogLevel('error');
      const log = logger('suppress-test');
      log.info('suppressed');
      // console.log should not have been called with the suppressed message
      // (it was mocked in beforeEach)
      const calls = (console.log as ReturnType<typeof vi.fn>).mock.calls;
      const found = calls.some((args: unknown[]) =>
        args.some((a) => typeof a === 'string' && a.includes('suppressed')),
      );
      expect(found).toBe(false);
    });

    it('console.error IS called for error-level when min level is error', () => {
      setLogLevel('error');
      const log = logger('error-console-test');
      log.error('visible error');
      expect(console.error).toHaveBeenCalled();
    });

    it('console.warn IS called for warn-level when min level is warn or below', () => {
      setLogLevel('warn');
      const log = logger('warn-console-test');
      log.warn('visible warning');
      expect(console.warn).toHaveBeenCalled();
    });
  });

  // ─── LEVEL_COLORS ──────────────────────────────────────────────

  describe('LEVEL_COLORS', () => {
    it('has entries for all log levels', () => {
      expect(LEVEL_COLORS.debug).toBeDefined();
      expect(LEVEL_COLORS.info).toBeDefined();
      expect(LEVEL_COLORS.warn).toBeDefined();
      expect(LEVEL_COLORS.error).toBeDefined();
    });

    it('values are ANSI escape sequences', () => {
      for (const val of Object.values(LEVEL_COLORS)) {
        expect(val).toMatch(/^\x1b\[/);
      }
    });
  });
});
