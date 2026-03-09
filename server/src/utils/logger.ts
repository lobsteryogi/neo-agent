/**
 * ░▒▓ THE ORACLE'S LOG ▓▒░
 *
 * "Throughout human history, we have been dependent on machines to survive."
 *
 * Structured logging utility for Neo-Agent.
 * Supports log levels, namespaced loggers, and optional file output.
 *
 * Usage:
 *   import { logger } from './utils/logger.js';
 *   const log = logger('module-name');
 *   log.info('Something happened', { key: 'value' });
 *   log.warn('Heads up', { detail: 42 });
 *   log.error('Bad thing', error);
 *   log.debug('Verbose detail');
 */

import dgram from 'dgram';
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// ─── Log Levels ─────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[2m', // dim
  info: '\x1b[32m', // green
  warn: '\x1b[33m', // yellow
  error: '\x1b[31m', // red
};

const RESET = '\x1b[0m';

// ─── Configuration ──────────────────────────────────────────────

interface LoggerConfig {
  /** Minimum log level to output (default: from NEO_LOG_LEVEL env or 'info') */
  minLevel: LogLevel;
  /** Whether to write logs to file (default: from NEO_LOG_FILE env) */
  logFile?: string;
  /** Whether to include timestamps (default: true) */
  timestamps: boolean;
}

const DEFAULT_LOG_FILE = join(homedir(), '.neo-agent', 'logs', 'neo.log');
const MAX_LOG_FILE_BYTES = 1_000_000; // 1 MB — rotate when exceeded

const config: LoggerConfig = {
  minLevel: (process.env.NEO_LOG_LEVEL as LogLevel) || 'info',
  logFile: process.env.NEO_LOG_FILE || DEFAULT_LOG_FILE,
  timestamps: true,
};

// Ensure log directory exists
if (config.logFile) {
  const dir = join(config.logFile, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ─── Ring Buffer (captures ALL entries regardless of log level) ──

const RING_BUFFER_SIZE = 200;
const ringBuffer: LogEntry[] = [];
let ringIndex = 0;

function pushToRing(entry: LogEntry): void {
  if (ringBuffer.length < RING_BUFFER_SIZE) {
    ringBuffer.push(entry);
  } else {
    ringBuffer[ringIndex] = entry;
  }
  ringIndex = (ringIndex + 1) % RING_BUFFER_SIZE;
}

/**
 * Retrieve recent log entries from the in-memory ring buffer.
 * Returns entries in chronological order (oldest first).
 * These are captured regardless of the console log level.
 */
export function getRecentLogs(count?: number, namespace?: string): LogEntry[] {
  // Reconstruct in chronological order
  const ordered =
    ringBuffer.length < RING_BUFFER_SIZE
      ? [...ringBuffer]
      : [...ringBuffer.slice(ringIndex), ...ringBuffer.slice(0, ringIndex)];

  const filtered = namespace ? ordered.filter((e) => e.namespace === namespace) : ordered;

  return count ? filtered.slice(-count) : filtered;
}

/** Clear the ring buffer. */
export function clearRecentLogs(): void {
  ringBuffer.length = 0;
  ringIndex = 0;
}

// ─── Log Entry ──────────────────────────────────────────────────

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  namespace: string;
  message: string;
  data?: Record<string, unknown>;
  error?: { message: string; stack?: string };
}

// ─── Logger Instance ────────────────────────────────────────────

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, errorOrData?: Error | Record<string, unknown>): void;
}

function formatForConsole(entry: LogEntry): string {
  const color = LEVEL_COLORS[entry.level];
  const levelTag = entry.level.toUpperCase().padEnd(5);
  const ts = config.timestamps ? `\x1b[2m${entry.timestamp}\x1b[0m ` : '';
  const ns = `\x1b[36m[${entry.namespace}]${RESET}`;
  const msg = `${color}${levelTag}${RESET} ${ts}${ns} ${entry.message}`;

  if (entry.error) {
    return `${msg} ${LEVEL_COLORS.error}${entry.error.message}${RESET}${entry.error.stack ? `\n${LEVEL_COLORS.debug}${entry.error.stack}${RESET}` : ''}`;
  }
  if (entry.data && Object.keys(entry.data).length > 0) {
    return `${msg} ${LEVEL_COLORS.debug}${JSON.stringify(entry.data)}${RESET}`;
  }
  return msg;
}

function formatForFile(entry: LogEntry): string {
  return JSON.stringify(entry);
}

function rotateIfNeeded(): void {
  if (!config.logFile) return;
  try {
    const stats = statSync(config.logFile);
    if (stats.size > MAX_LOG_FILE_BYTES) {
      // Keep the last half
      const content = readFileSync(config.logFile, 'utf-8');
      const half = content.slice(content.length / 2);
      // Start from the first complete line
      const firstNewline = half.indexOf('\n');
      writeFileSync(config.logFile, firstNewline >= 0 ? half.slice(firstNewline + 1) : half);
    }
  } catch {
    // File may not exist yet — that's fine
  }
}

function emit(entry: LogEntry): void {
  // Always capture in ring buffer (regardless of log level)
  pushToRing(entry);

  // UDP relay to server terminal (if enabled)
  relayLog(entry);

  // Console output (level-gated)
  if (LEVEL_PRIORITY[entry.level] >= LEVEL_PRIORITY[config.minLevel]) {
    const consoleFn =
      entry.level === 'error' ? console.error : entry.level === 'warn' ? console.warn : console.log;
    consoleFn(formatForConsole(entry));
  }

  // File output (always — captures all levels)
  if (config.logFile) {
    try {
      appendFileSync(config.logFile, formatForFile(entry) + '\n');
      rotateIfNeeded();
    } catch {
      // If we can't write to the log file, don't crash the process
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────

/**
 * Create a namespaced logger instance.
 *
 * @param namespace - Module or component name (e.g., 'historian', 'session-queue')
 */
export function logger(namespace: string): Logger {
  const makeEntry = (
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    error?: Error,
  ): LogEntry => ({
    timestamp: new Date().toISOString(),
    level,
    namespace,
    message,
    data,
    error: error ? { message: error.message, stack: error.stack } : undefined,
  });

  return {
    debug(message, data) {
      emit(makeEntry('debug', message, data));
    },
    info(message, data) {
      emit(makeEntry('info', message, data));
    },
    warn(message, data) {
      emit(makeEntry('warn', message, data));
    },
    error(message, errorOrData) {
      if (errorOrData instanceof Error) {
        emit(makeEntry('error', message, undefined, errorOrData));
      } else {
        emit(makeEntry('error', message, errorOrData));
      }
    },
  };
}

/**
 * Update the minimum log level at runtime.
 */
export function setLogLevel(level: LogLevel): void {
  config.minLevel = level;
}

/**
 * Get the current minimum log level.
 */
export function getLogLevel(): LogLevel {
  return config.minLevel;
}

// ─── UDP Log Relay (client side) ────────────────────────────────

const RELAY_PORT = Number(process.env.NEO_LOG_RELAY_PORT) || 3143;
let relaySocket: dgram.Socket | null = null;
let relayEnabled = false;

/**
 * Enable UDP log relay — sends a copy of every log entry to the
 * neo:dev server terminal via UDP. Call this in remote processes
 * (e.g. the chat CLI) so their logs appear in the server output.
 *
 * UDP is fire-and-forget: if no relay listener is running, packets
 * are silently dropped with zero overhead.
 */
export function enableLogRelay(): void {
  if (relayEnabled) return;
  relayEnabled = true;
  relaySocket = dgram.createSocket('udp4');
  relaySocket.unref(); // Don't keep process alive
}

function relayLog(entry: LogEntry): void {
  if (!relayEnabled || !relaySocket) return;
  try {
    const buf = Buffer.from(JSON.stringify(entry));
    relaySocket.send(buf, RELAY_PORT, '127.0.0.1');
  } catch {
    // Fire and forget — never crash for relay failures
  }
}
