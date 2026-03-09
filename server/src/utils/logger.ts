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

import { appendFileSync, existsSync, mkdirSync } from 'fs';
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

const config: LoggerConfig = {
  minLevel: (process.env.NEO_LOG_LEVEL as LogLevel) || 'info',
  logFile: process.env.NEO_LOG_FILE || undefined,
  timestamps: true,
};

// Ensure log directory exists
if (config.logFile) {
  const dir = join(config.logFile, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ─── Log Entry ──────────────────────────────────────────────────

interface LogEntry {
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

function emit(entry: LogEntry): void {
  // Check level threshold
  if (LEVEL_PRIORITY[entry.level] < LEVEL_PRIORITY[config.minLevel]) return;

  // Console output
  const consoleFn =
    entry.level === 'error' ? console.error : entry.level === 'warn' ? console.warn : console.log;
  consoleFn(formatForConsole(entry));

  // File output
  if (config.logFile) {
    try {
      appendFileSync(config.logFile, formatForFile(entry) + '\n');
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
