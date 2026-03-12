import dgram from 'dgram';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogEntry } from '../../src/utils/logger.js';

// We need to import startLogRelay from the module under test.
// The module has side-effect-free exports, so import is straightforward.
import { startLogRelay } from '../../src/utils/log-relay.js';

describe('log-relay — startLogRelay', () => {
  let mockSocket: {
    on: ReturnType<typeof vi.fn>;
    bind: ReturnType<typeof vi.fn>;
    unref: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockSocket = {
      on: vi.fn(),
      bind: vi.fn(),
      unref: vi.fn(),
      close: vi.fn(),
    };
    vi.spyOn(dgram, 'createSocket').mockReturnValue(mockSocket as unknown as dgram.Socket);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a UDP4 socket', () => {
    startLogRelay(9999);
    expect(dgram.createSocket).toHaveBeenCalledWith('udp4');
  });

  it('binds to 127.0.0.1 on the specified port', () => {
    startLogRelay(9999);
    expect(mockSocket.bind).toHaveBeenCalledWith(9999, '127.0.0.1');
  });

  it('binds to default port when none specified', () => {
    startLogRelay();
    // Default is RELAY_PORT which is Number(process.env.NEO_LOG_RELAY_PORT) || 3143
    expect(mockSocket.bind).toHaveBeenCalledWith(3143, '127.0.0.1');
  });

  it('unrefs the socket so it does not keep the process alive', () => {
    startLogRelay(9999);
    expect(mockSocket.unref).toHaveBeenCalled();
  });

  it('registers a message handler', () => {
    startLogRelay(9999);
    const onCalls = mockSocket.on.mock.calls;
    const messageHandler = onCalls.find(([event]: [string]) => event === 'message');
    expect(messageHandler).toBeDefined();
  });

  it('registers an error handler', () => {
    startLogRelay(9999);
    const onCalls = mockSocket.on.mock.calls;
    const errorHandler = onCalls.find(([event]: [string]) => event === 'error');
    expect(errorHandler).toBeDefined();
  });

  // ─── Message Handler Behavior ──────────────────────────────────

  describe('message handler', () => {
    function getMessageHandler(): (msg: Buffer) => void {
      startLogRelay(9999);
      const onCalls = mockSocket.on.mock.calls;
      const messageCall = onCalls.find(([event]: [string]) => event === 'message');
      return messageCall[1];
    }

    it('prints info-level entries via console.log', () => {
      const handler = getMessageHandler();
      const entry: LogEntry = {
        timestamp: '2026-03-12T10:30:00.000Z',
        level: 'info',
        namespace: 'test',
        message: 'hello relay',
      };
      handler(Buffer.from(JSON.stringify(entry)));
      expect(console.log).toHaveBeenCalled();
    });

    it('prints warn-level entries via console.warn', () => {
      const handler = getMessageHandler();
      const entry: LogEntry = {
        timestamp: '2026-03-12T10:30:00.000Z',
        level: 'warn',
        namespace: 'test',
        message: 'warning relay',
      };
      handler(Buffer.from(JSON.stringify(entry)));
      expect(console.warn).toHaveBeenCalled();
    });

    it('prints error-level entries via console.error', () => {
      const handler = getMessageHandler();
      const entry: LogEntry = {
        timestamp: '2026-03-12T10:30:00.000Z',
        level: 'error',
        namespace: 'test',
        message: 'error relay',
      };
      handler(Buffer.from(JSON.stringify(entry)));
      expect(console.error).toHaveBeenCalled();
    });

    it('prints debug-level entries via console.log', () => {
      const handler = getMessageHandler();
      const entry: LogEntry = {
        timestamp: '2026-03-12T10:30:00.000Z',
        level: 'debug',
        namespace: 'test',
        message: 'debug relay',
      };
      handler(Buffer.from(JSON.stringify(entry)));
      expect(console.log).toHaveBeenCalled();
    });

    it('includes error details in formatted output', () => {
      const handler = getMessageHandler();
      const entry: LogEntry = {
        timestamp: '2026-03-12T10:30:00.000Z',
        level: 'error',
        namespace: 'test',
        message: 'crash',
        error: { message: 'kaboom', stack: 'Error: kaboom\n    at test' },
      };
      handler(Buffer.from(JSON.stringify(entry)));
      const call = (console.error as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(call).toContain('kaboom');
      expect(call).toContain('crash');
    });

    it('includes data in formatted output', () => {
      const handler = getMessageHandler();
      const entry: LogEntry = {
        timestamp: '2026-03-12T10:30:00.000Z',
        level: 'info',
        namespace: 'test',
        message: 'data entry',
        data: { foo: 'bar' },
      };
      handler(Buffer.from(JSON.stringify(entry)));
      const call = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(call).toContain('{"foo":"bar"}');
    });

    it('includes remote indicator', () => {
      const handler = getMessageHandler();
      const entry: LogEntry = {
        timestamp: '2026-03-12T10:30:00.000Z',
        level: 'info',
        namespace: 'test',
        message: 'remote check',
      };
      handler(Buffer.from(JSON.stringify(entry)));
      const call = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      // The remote indicator is the lightning bolt
      expect(call).toContain('\u26A1'); // ⚡
    });

    it('silently ignores malformed JSON messages', () => {
      const handler = getMessageHandler();
      expect(() => handler(Buffer.from('not valid json'))).not.toThrow();
    });

    it('silently ignores empty messages', () => {
      const handler = getMessageHandler();
      expect(() => handler(Buffer.from(''))).not.toThrow();
    });
  });

  // ─── Error Handler Behavior ────────────────────────────────────

  describe('error handler', () => {
    function getErrorHandler(): (err: NodeJS.ErrnoException) => void {
      startLogRelay(9999);
      const onCalls = mockSocket.on.mock.calls;
      const errorCall = onCalls.find(([event]: [string]) => event === 'error');
      return errorCall[1];
    }

    it('closes socket on EADDRINUSE', () => {
      const handler = getErrorHandler();
      const err = new Error('port in use') as NodeJS.ErrnoException;
      err.code = 'EADDRINUSE';
      handler(err);
      expect(mockSocket.close).toHaveBeenCalled();
    });

    it('does not log to console.error on EADDRINUSE', () => {
      const handler = getErrorHandler();
      const err = new Error('port in use') as NodeJS.ErrnoException;
      err.code = 'EADDRINUSE';
      handler(err);
      // console.error should not be called for EADDRINUSE
      // (it was called 0 times or only for the generic path)
      const calls = (console.error as ReturnType<typeof vi.fn>).mock.calls;
      const relayErrorCalls = calls.filter(
        (args: unknown[]) =>
          typeof args[0] === 'string' && (args[0] as string).includes('Log relay error'),
      );
      expect(relayErrorCalls.length).toBe(0);
    });

    it('logs and closes on other errors', () => {
      const handler = getErrorHandler();
      const err = new Error('some other error') as NodeJS.ErrnoException;
      err.code = 'EACCES';
      handler(err);
      expect(console.error).toHaveBeenCalledWith('Log relay error:', 'some other error');
      expect(mockSocket.close).toHaveBeenCalled();
    });
  });
});
