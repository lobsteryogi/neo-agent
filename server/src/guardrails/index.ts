/**
 * ░▒▓ GUARDRAIL PIPELINE ▓▒░
 *
 * "I know kung fu." — But first, safety checks.
 *
 * Pipeline order (Audit Fix S1):
 * Redactor → Firewall → Cleaner → Bouncer → Accountant
 *
 * Redactor runs first to mask secrets before other guards inspect content.
 * Pipeline stops on first block.
 */

import type { GuardrailVerdict, InboundMessage, SanitizedMessage } from '@neo-agent/shared';
import { logger } from '../utils/logger.js';
import { Accountant, type AccountantConfig } from './accountant.js';
import { Bouncer, type BouncerConfig } from './bouncer.js';
import { Cleaner } from './cleaner.js';
import { Firewall } from './firewall.js';
import { Redactor, type Guardrail } from './redactor.js';

const log = logger('guardrails');

export interface GuardrailPipelineConfig {
  bouncer?: BouncerConfig;
  accountant?: AccountantConfig;
  firewallThreshold?: number;
}

export class GuardrailPipeline {
  private guards: Guardrail[];

  constructor(config: GuardrailPipelineConfig = {}) {
    this.guards = [
      new Redactor(),
      new Firewall(config.firewallThreshold),
      new Cleaner(),
      new Bouncer(config.bouncer),
      new Accountant(config.accountant),
    ];
  }

  async process(message: any): Promise<SanitizedMessage> {
    let current = { ...message };

    for (const guard of this.guards) {
      const verdict: GuardrailVerdict = await guard.check(current);

      if (verdict.blocked) {
        log.warn('Guard blocked', {
          guard: guard.name,
          reason: verdict.reason,
          confidence: verdict.confidence,
        });
        const err = new Error(`Blocked by ${guard.name}: ${verdict.reason}`);
        (err as any).guard = guard.name;
        (err as any).verdict = verdict;
        throw err;
      }

      // If guard produced a sanitized version, use it going forward
      if (verdict.sanitized) {
        log.debug('Guard sanitized content', {
          guard: guard.name,
          originalLength: (message.content ?? '').length,
          sanitizedLength: (verdict.sanitized.content ?? '').length,
        });
        current = verdict.sanitized;
      } else {
        log.debug('Guard passed', { guard: guard.name, confidence: verdict.confidence ?? null });
      }
    }

    return current as SanitizedMessage;
  }
}

export { Accountant } from './accountant.js';
export { Bouncer } from './bouncer.js';
export { Cleaner } from './cleaner.js';
export { Firewall } from './firewall.js';
export { Redactor } from './redactor.js';
export type { Guardrail } from './redactor.js';
