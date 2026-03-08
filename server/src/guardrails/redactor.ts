/**
 * ░▒▓ THE REDACTOR ▓▒░
 *
 * "I know what you've been doing. I know why you hardly sleep."
 *
 * Masks API keys, JWTs, passwords, and other secrets before
 * the message reaches other guards or Claude.
 */

import type { GuardrailVerdict, SanitizedMessage } from '@neo-agent/shared';

export interface Guardrail {
  name: string;
  check(message: any): Promise<GuardrailVerdict>;
}

// Patterns that indicate secrets
const PATTERNS: Array<{ regex: RegExp; label: string }> = [
  // API keys (sk-*, pk-*, rk-*, key-*)
  { regex: /\b(sk|pk|rk|key)-[a-zA-Z0-9]{20,}\b/g, label: '[REDACTED_API_KEY]' },
  // AWS keys
  { regex: /\bAKIA[A-Z0-9]{16}\b/g, label: '[REDACTED_AWS_KEY]' },
  // JWT tokens
  {
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    label: '[REDACTED_JWT]',
  },
  // Generic long hex tokens (32+ chars)
  { regex: /\b[0-9a-f]{32,}\b/gi, label: '[REDACTED_TOKEN]' },
  // Password patterns
  {
    regex: /(?:password|passwd|pwd|secret|token)\s*[:=]\s*['"]?([^\s'"]+)/gi,
    label: '[REDACTED_SECRET]',
  },
  // Bearer tokens
  { regex: /Bearer\s+[A-Za-z0-9._~+/=-]+/gi, label: 'Bearer [REDACTED]' },
];

export class Redactor implements Guardrail {
  readonly name = 'Redactor';

  async check(message: any): Promise<GuardrailVerdict> {
    const content = message.content ?? '';
    let sanitized = content;
    let modified = false;

    for (const { regex, label } of PATTERNS) {
      // Reset regex state
      regex.lastIndex = 0;
      if (regex.test(sanitized)) {
        regex.lastIndex = 0;
        sanitized = sanitized.replace(regex, label);
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
        content: sanitized,
        originalContent: content,
      } as SanitizedMessage,
    };
  }
}
