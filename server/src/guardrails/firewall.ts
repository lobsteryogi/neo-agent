/**
 * ░▒▓ THE FIREWALL ▓▒░
 *
 * "Never send a human to do a machine's job."
 *
 * Scoring-based prompt injection detection.
 * Each pattern has a weight; cumulative score ≥ 0.6 = blocked.
 */

import type { GuardrailVerdict, InboundMessage, SanitizedMessage } from '@neo-agent/shared';
import { logger } from '../utils/logger.js';
import type { Guardrail } from './redactor.js';

const log = logger('firewall');

interface InjectionPattern {
  regex: RegExp;
  weight: number;
  tag: string;
}

const INJECTION_PATTERNS: InjectionPattern[] = [
  // Direct instruction override
  { regex: /ignore\s+(all\s+)?previous\s+instructions/i, weight: 0.7, tag: 'override' },
  { regex: /disregard\s+(all\s+)?prior/i, weight: 0.7, tag: 'override' },
  { regex: /forget\s+(all\s+)?previous/i, weight: 0.6, tag: 'override' },

  // Role injection
  { regex: /you\s+are\s+now\s+(a|an)\s+/i, weight: 0.5, tag: 'role-inject' },
  { regex: /act\s+as\s+(a|an)\s+/i, weight: 0.3, tag: 'role-inject' },
  { regex: /pretend\s+(to\s+be|you'?re)\s+/i, weight: 0.5, tag: 'role-inject' },

  // System prompt extraction
  { regex: /what\s+(is|are)\s+your\s+(system\s+)?prompt/i, weight: 0.4, tag: 'extraction' },
  { regex: /show\s+me\s+your\s+(system\s+)?instructions/i, weight: 0.5, tag: 'extraction' },
  { regex: /repeat\s+your\s+(initial|system|original)/i, weight: 0.5, tag: 'extraction' },

  // Encoded payloads
  { regex: /base64\s+[A-Za-z0-9+/=]{20,}/i, weight: 0.5, tag: 'encoded' },

  // HTML entity obfuscation
  { regex: /&#x?[0-9a-f]+;/i, weight: 0.4, tag: 'obfuscation' },

  // Multi-step manipulation
  { regex: /step\s*1.*step\s*2/is, weight: 0.4, tag: 'multi-step' },
];

export class Firewall implements Guardrail {
  readonly name = 'Firewall';
  private threshold: number;

  constructor(threshold: number = 0.6) {
    this.threshold = threshold;
  }

  async check(message: InboundMessage | SanitizedMessage): Promise<GuardrailVerdict> {
    const content = message.content ?? '';
    let score = 0;
    const matched: string[] = [];

    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.regex.test(content)) {
        score += pattern.weight;
        matched.push(pattern.tag);
      }
    }

    // Cap at 1.0
    const confidence = Math.min(score, 1.0);

    if (matched.length > 0) {
      log.debug('Injection scan', {
        score: confidence.toFixed(2),
        threshold: this.threshold,
        matched,
      });
    }

    if (confidence >= this.threshold) {
      log.warn('Injection blocked', { score: confidence.toFixed(2), patterns: matched });
      return {
        blocked: true,
        guard: this.name,
        reason: `Injection detected (score: ${confidence.toFixed(2)}, patterns: ${matched.join(', ')})`,
        confidence,
      };
    }

    return { blocked: false, confidence };
  }
}
