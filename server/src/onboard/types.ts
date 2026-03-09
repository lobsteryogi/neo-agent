/**
 * ░▒▓ ONBOARD WIZARD TYPES ▓▒░
 *
 * "There is no spoon."
 *
 * Shared types for the modular wizard step pipeline.
 */

import type { WizardAnswers } from '@neo-agent/shared';

// ─── Step Metadata ─────────────────────────────────────────────

export interface StepMeta {
  index: number;
  total: number;
  name: string;
  codename: string; // Matrix-themed codename
}

// ─── Step Result ───────────────────────────────────────────────

export interface StepResult<T = Partial<WizardAnswers>> {
  answers: T;
  skipped?: boolean;
}

// ─── Wizard Context ────────────────────────────────────────────

/** Accumulates answers as the wizard progresses through steps. */
export type WizardContext = Partial<WizardAnswers>;

// ─── Step Function ─────────────────────────────────────────────

/** Each step module exports a function matching this signature. */
export type StepFn = (ctx: WizardContext, meta: StepMeta) => Promise<StepResult>;

// ─── Step Definitions ──────────────────────────────────────────

export interface StepDefinition {
  name: string;
  codename: string;
  run: StepFn;
}
