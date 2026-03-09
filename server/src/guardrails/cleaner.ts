/**
 * ░▒▓ THE CLEANER ▓▒░
 *
 * "I need an exit."
 *
 * Strips dangerous shell escape sequences, path traversals,
 * and null bytes from messages.
 */

import type { GuardrailVerdict, InboundMessage, SanitizedMessage } from '@neo-agent/shared';
import type { Guardrail } from './redactor.js';

const DANGEROUS_PATTERNS: Array<{ regex: RegExp; replacement: string; tag: string }> = [
  // Shell command substitution
  { regex: /\$\([^)]+\)/g, replacement: '[REMOVED_CMD_SUB]', tag: 'cmd-sub' },
  // Backtick command substitution
  { regex: /`[^`]+`/g, replacement: '[REMOVED_BACKTICK]', tag: 'backtick' },
  // Path traversal
  { regex: /\.\.\//g, replacement: '', tag: 'path-traversal' },
  // Null bytes
  { regex: /\x00/g, replacement: '', tag: 'null-byte' },
  // Control characters (except newline, tab, carriage return)
  { regex: /[\x01-\x08\x0B\x0C\x0E-\x1F]/g, replacement: '', tag: 'control-char' },
];

export class Cleaner implements Guardrail {
  readonly name = 'Cleaner';

  async check(message: InboundMessage | SanitizedMessage): Promise<GuardrailVerdict> {
    const content = message.content ?? '';
    let cleaned = content;
    let modified = false;

    for (const { regex, replacement } of DANGEROUS_PATTERNS) {
      regex.lastIndex = 0;
      if (regex.test(cleaned)) {
        regex.lastIndex = 0;
        cleaned = cleaned.replace(regex, replacement);
        modified = true;
      }
    }

    if (!modified) {
      return { blocked: false };
    }

    return {
      blocked: false,
      guard: this.name,
      sanitized: {
        ...message,
        content: cleaned,
        originalContent:
          ('originalContent' in message ? message.originalContent : undefined) ?? content,
      } as SanitizedMessage,
    };
  }
}
