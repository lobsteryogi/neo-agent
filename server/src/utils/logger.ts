/**
 * ░▒▓ THE ORACLE'S LOG ▓▒░
 *
 * "Throughout human history, we have been dependent on machines to survive."
 *
 * Structured logging utility for Neo-Agent.
 * Color-coded namespaces, highlighted values, human-readable formatting.
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
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { ensureDir } from './fs.js';

// ─── ANSI Helpers ────────────────────────────────────────────────

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const ITALIC = '\x1b[3m';

const FG = {
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
} as const;

const BG = {
  red: '\x1b[41m',
  green: '\x1b[42m',
  yellow: '\x1b[43m',
  blue: '\x1b[44m',
  magenta: '\x1b[45m',
  cyan: '\x1b[46m',
  white: '\x1b[47m',
} as const;

// ─── Log Levels ─────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: DIM,
  info: FG.green,
  warn: FG.yellow,
  error: FG.red,
};

const LEVEL_BADGES: Record<LogLevel, string> = {
  debug: `${DIM}DBG${RESET}`,
  info: `${FG.green}INF${RESET}`,
  warn: `${BOLD}${FG.yellow}WRN${RESET}`,
  error: `${BOLD}${BG.red}${FG.white} ERR ${RESET}`,
};

// ─── Namespace Colors ───────────────────────────────────────────
// Each topic gets a distinct color for quick visual scanning.

const NAMESPACE_STYLES: Record<string, string> = {
  // Core pipeline
  agent: `${BOLD}${FG.cyan}`,
  bridge: `${FG.blue}`,

  // Routing & classification
  router: `${FG.magenta}`,
  classifier: `${FG.magenta}`,
  orchestrator: `${FG.brightMagenta}`,

  // Security & guardrails
  guardrails: `${FG.yellow}`,
  bouncer: `${FG.yellow}`,
  accountant: `${FG.yellow}`,
  firewall: `${FG.yellow}`,
  redactor: `${FG.yellow}`,
  cleaner: `${FG.yellow}`,

  // Gates
  'gate:free-will': `${FG.brightYellow}`,
  'gate:file-guard': `${FG.brightYellow}`,
  'gate:cost': `${FG.brightYellow}`,

  // Memory & sessions
  'memory:transcript': `${FG.green}`,
  'memory:extractor': `${FG.green}`,
  'memory:long-term': `${FG.green}`,
  session: `${FG.green}`,

  // Channels
  telegram: `${FG.brightBlue}`,
  chat: `${FG.brightCyan}`,

  // Infrastructure
  server: `${FG.gray}`,
  cron: `${FG.gray}`,
  tasks: `${FG.gray}`,
};

function getNamespaceStyle(ns: string): string {
  return NAMESPACE_STYLES[ns] ?? FG.cyan;
}

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
  ensureDir(dirname(config.logFile));
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

// ─── Value Formatting ───────────────────────────────────────────
// Highlight specific value types for quick visual scanning.

/** Keys whose values should be shown with special highlighting */
const MODEL_KEYS = new Set(['model', 'selectedModel', 'lastModelTier', 'from', 'to']);
const COST_KEYS = new Set(['cost', 'costUsd', 'totalCost']);
const TOKEN_KEYS = new Set([
  'tokens',
  'input',
  'output',
  'inputTokens',
  'outputTokens',
  'totalInputTokens',
  'totalOutputTokens',
  'tokenEstimate',
  'totalTokens',
  'tokensUsed',
]);
const BOOL_KEYS = new Set([
  'success',
  'blocked',
  'modified',
  'isGroup',
  'isError',
  'hasMedia',
  'shouldDecompose',
]);
const CONTENT_KEYS = new Set(['content', 'prompt']);
const ID_KEYS = new Set(['sessionId', 'sdkSessionId', 'userId', 'profileId', 'toolUseId']);
const SKIP_KEYS = new Set(['stack']); // shown separately

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return `${DIM}null${RESET}`;

  if (MODEL_KEYS.has(key) && typeof value === 'string') {
    return `${BOLD}${FG.brightMagenta}${value}${RESET}`;
  }
  if (COST_KEYS.has(key) && typeof value === 'number') {
    const formatted = value < 0.01 ? value.toFixed(6) : value.toFixed(4);
    const color = value > 1 ? FG.red : value > 0.1 ? FG.yellow : FG.green;
    return `${color}$${formatted}${RESET}`;
  }
  if (TOKEN_KEYS.has(key) && typeof value === 'number') {
    const formatted = value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
    return `${FG.brightCyan}${formatted}${RESET}`;
  }
  if (BOOL_KEYS.has(key) && typeof value === 'boolean') {
    return value ? `${FG.green}✓${RESET}` : `${FG.red}✗${RESET}`;
  }
  if (CONTENT_KEYS.has(key) && typeof value === 'string') {
    const truncated = value.length > 120 ? value.slice(0, 120) + '…' : value;
    return `${FG.white}"${truncated}"${RESET}`;
  }
  if (ID_KEYS.has(key) && typeof value === 'string') {
    const short = value.length > 12 ? value.slice(0, 8) + '…' : value;
    return `${DIM}${short}${RESET}`;
  }
  if (typeof value === 'number') {
    return `${FG.brightCyan}${value}${RESET}`;
  }
  if (typeof value === 'string') {
    return `${FG.white}${value}${RESET}`;
  }
  if (typeof value === 'object') {
    return `${DIM}${JSON.stringify(value)}${RESET}`;
  }
  return String(value);
}

function formatData(data: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (SKIP_KEYS.has(key)) continue;
    if (value === undefined) continue;
    parts.push(`${DIM}${key}=${RESET}${formatValue(key, value)}`);
  }
  return parts.join(' ');
}

// ─── Console Formatter ──────────────────────────────────────────

function formatForConsole(entry: LogEntry): string {
  const badge = LEVEL_BADGES[entry.level];
  const nsStyle = getNamespaceStyle(entry.namespace);

  // Timestamp: just HH:MM:SS for brevity
  const ts = config.timestamps ? `${DIM}${entry.timestamp.slice(11, 19)}${RESET} ` : '';

  // Namespace tag with topic color
  const ns = `${nsStyle}[${entry.namespace}]${RESET}`;

  // Message — bold for info+ levels
  const msgStyle = entry.level === 'debug' ? DIM : '';
  const msg = `${msgStyle}${entry.message}${msgStyle ? RESET : ''}`;

  let line = `${badge} ${ts}${ns} ${msg}`;

  // Data formatting
  if (entry.data && Object.keys(entry.data).length > 0) {
    line += `  ${formatData(entry.data)}`;
  }

  // Error formatting
  if (entry.error) {
    line += `  ${BOLD}${FG.red}${entry.error.message}${RESET}`;
    if (entry.error.stack) {
      line += `\n${DIM}${entry.error.stack}${RESET}`;
    }
  }

  // Stack trace from data
  if (entry.data?.stack && typeof entry.data.stack === 'string') {
    line += `\n${DIM}${(entry.data.stack as string).slice(0, 500)}${RESET}`;
  }

  return line;
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
