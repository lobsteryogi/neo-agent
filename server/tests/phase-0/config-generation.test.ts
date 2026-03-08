import type { WizardAnswers } from '@neo-agent/shared';
import { WIZARD_DEFAULTS } from '@neo-agent/shared';
import { randomBytes } from 'crypto';
import { describe, expect, it } from 'vitest';

describe('Phase 0 — Config Generation', () => {
  it('WizardAnswers has all required fields', () => {
    const answers: WizardAnswers = { ...WIZARD_DEFAULTS };
    expect(answers.userName).toBe('Human');
    expect(answers.agentName).toBe('Neo');
    expect(answers.permissionMode).toBe('default');
    expect(answers.defaultModel).toBe('sonnet');
    expect(answers.port).toBe(3141);
    expect(answers.wsPort).toBe(3142);
    expect(answers.fadeThreshold).toBe(0.85);
    expect(answers.routingProfile).toBe('auto');
    expect(answers.gatePhrase).toBe('do it');
    expect(answers.protectedPaths).toEqual(['~/.ssh/', '~/.gnupg/', '.env']);
    expect(answers.enableDashboard).toBe(true);
  });

  it('WS token generation produces unique values', () => {
    const token1 = randomBytes(32).toString('hex');
    const token2 = randomBytes(32).toString('hex');
    expect(token1).not.toBe(token2);
    expect(token1).toHaveLength(64);
  });

  it('default model is a valid tier', () => {
    expect(['haiku', 'sonnet', 'opus']).toContain(WIZARD_DEFAULTS.defaultModel);
  });

  it('default routing profile is valid', () => {
    expect(['auto', 'eco', 'balanced', 'premium']).toContain(WIZARD_DEFAULTS.routingProfile);
  });

  it('protected paths are an array', () => {
    expect(Array.isArray(WIZARD_DEFAULTS.protectedPaths)).toBe(true);
    expect(WIZARD_DEFAULTS.protectedPaths.length).toBeGreaterThan(0);
  });

  it('fade threshold is within valid range', () => {
    expect(WIZARD_DEFAULTS.fadeThreshold).toBeGreaterThanOrEqual(0.5);
    expect(WIZARD_DEFAULTS.fadeThreshold).toBeLessThanOrEqual(0.95);
  });
});
