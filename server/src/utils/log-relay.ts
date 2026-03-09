/**
 * ░▒▓ LOG RELAY ▓▒░
 *
 * UDP-based log relay so remote processes (chat CLI, etc.)
 * can stream their logs into the neo:dev server terminal.
 *
 * Server side: startLogRelay() listens for incoming log entries.
 * Client side: enableLogRelay() in logger.ts sends entries via UDP.
 */

import dgram from 'dgram';
import type { LogEntry } from './logger.js';

const RELAY_PORT = Number(process.env.NEO_LOG_RELAY_PORT) || 3143;

const LEVEL_COLORS: Record<string, string> = {
  debug: '\x1b[2m',
  info: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};
const RESET = '\x1b[0m';

function formatRelayEntry(entry: LogEntry): string {
  const color = LEVEL_COLORS[entry.level] || '';
  const levelTag = entry.level.toUpperCase().padEnd(5);
  const ts = `\x1b[2m${entry.timestamp}\x1b[0m `;
  const ns = `\x1b[36m[${entry.namespace}]${RESET}`;
  const remote = `\x1b[35m⚡${RESET}`;
  let msg = `${remote} ${color}${levelTag}${RESET} ${ts}${ns} ${entry.message}`;

  if (entry.error) {
    msg += ` ${LEVEL_COLORS.error}${entry.error.message}${RESET}`;
    if (entry.error.stack) msg += `\n\x1b[2m${entry.error.stack}${RESET}`;
  } else if (entry.data && Object.keys(entry.data).length > 0) {
    msg += ` \x1b[2m${JSON.stringify(entry.data)}${RESET}`;
  }
  return msg;
}

/**
 * Start the UDP log relay listener on the server side.
 * Prints incoming log entries from remote processes.
 */
export function startLogRelay(port = RELAY_PORT): void {
  const server = dgram.createSocket('udp4');

  server.on('message', (msg) => {
    try {
      const entry: LogEntry = JSON.parse(msg.toString());
      const consoleFn =
        entry.level === 'error'
          ? console.error
          : entry.level === 'warn'
            ? console.warn
            : console.log;
      consoleFn(formatRelayEntry(entry));
    } catch {
      // Ignore malformed messages
    }
  });

  server.on('error', (err) => {
    // Port in use (another server running) — silently skip
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      server.close();
      return;
    }
    console.error('Log relay error:', err.message);
    server.close();
  });

  server.bind(port, '127.0.0.1');
  server.unref(); // Don't keep the process alive just for this
}
