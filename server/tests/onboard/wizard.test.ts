import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock @clack/prompts before importing anything ──────────────

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  confirm: vi.fn(),
  text: vi.fn(),
  select: vi.fn(),
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    step: vi.fn(),
  },
  isCancel: vi.fn(() => false),
}));

// Mock terminal utilities so no actual console output during tests
vi.mock('../../src/utils/terminal.js', () => ({
  WAKE_UP_ART: '',
  color: {
    green: (s: string) => s,
    brightGreen: (s: string) => s,
    darkGreen: (s: string) => s,
    dim: (s: string) => s,
    red: (s: string) => s,
    cyan: (s: string) => s,
    matrix: (s: string) => s,
    phosphor: (s: string) => s,
  },
  digitalRain: () => '',
  matrixBox: () => '',
  matrixProgress: () => '',
  sectionHeader: () => '',
  randomQuote: () => 'test quote',
  sleep: vi.fn().mockResolvedValue(undefined),
  typeText: vi.fn().mockResolvedValue(undefined),
  status: {
    ok: (s: string) => s,
    warn: (s: string) => s,
  },
}));

// Mock the progress module
vi.mock('../../src/onboard/progress.js', () => ({
  showStepHeader: vi.fn(),
  showStepComplete: vi.fn(),
}));

// Mock the data module
vi.mock('../../src/data/matrix-quotes.js', () => ({
  Q: {
    matrixHasYou: 'The Matrix has you...',
    followWhiteRabbit: 'Follow the white rabbit.',
    noOneCanBeTold: 'No one can be told what the Matrix is.',
    stayInMatrix: 'You chose to stay in the Matrix.',
  },
}));

import type {
  StepDefinition,
  StepFn,
  StepMeta,
  StepResult,
  WizardContext,
} from '../../src/onboard/types';

// ─── Tests ──────────────────────────────────────────────────────

describe('Onboard Types', () => {
  it('StepMeta has correct shape', () => {
    const meta: StepMeta = {
      index: 1,
      total: 11,
      name: 'Test Step',
      codename: 'The Test',
    };
    expect(meta.index).toBe(1);
    expect(meta.total).toBe(11);
    expect(meta.name).toBe('Test Step');
    expect(meta.codename).toBe('The Test');
  });

  it('StepResult has answers and optional skipped flag', () => {
    const result: StepResult = {
      answers: { userName: 'Alice' },
    };
    expect(result.answers.userName).toBe('Alice');
    expect(result.skipped).toBeUndefined();

    const skipped: StepResult = {
      answers: {},
      skipped: true,
    };
    expect(skipped.skipped).toBe(true);
  });

  it('WizardContext is a partial WizardAnswers', () => {
    const ctx: WizardContext = { agentName: 'Neo', userName: 'Morpheus' };
    expect(ctx.agentName).toBe('Neo');
    expect(ctx.defaultModel).toBeUndefined();
  });

  it('StepDefinition bundles name, codename, and run function', () => {
    const runFn: StepFn = async () => ({ answers: {} });
    const def: StepDefinition = {
      name: 'Identity',
      codename: 'Identity',
      run: runFn,
    };
    expect(def.name).toBe('Identity');
    expect(typeof def.run).toBe('function');
  });
});

describe('Wizard Step Contract', () => {
  it('a step function receives context and meta, returns StepResult', async () => {
    const stepFn: StepFn = async (ctx, meta) => {
      return {
        answers: {
          userName: 'TestUser',
          agentName: ctx.agentName ?? 'Neo',
        },
      };
    };

    const result = await stepFn(
      { agentName: 'Trinity' },
      { index: 2, total: 11, name: 'Identity', codename: 'Identity' },
    );

    expect(result.answers.userName).toBe('TestUser');
    expect(result.answers.agentName).toBe('Trinity');
  });

  it('step results can be accumulated into context via Object.assign', async () => {
    const step1: StepFn = async () => ({ answers: { userName: 'Alice' } });
    const step2: StepFn = async () => ({ answers: { agentName: 'Neo' } });
    const step3: StepFn = async () => ({ answers: { defaultModel: 'sonnet' as const } });

    const ctx: WizardContext = {};
    const meta: StepMeta = { index: 1, total: 3, name: 'Test', codename: 'Test' };

    const r1 = await step1(ctx, meta);
    Object.assign(ctx, r1.answers);

    const r2 = await step2(ctx, meta);
    Object.assign(ctx, r2.answers);

    const r3 = await step3(ctx, meta);
    Object.assign(ctx, r3.answers);

    expect(ctx.userName).toBe('Alice');
    expect(ctx.agentName).toBe('Neo');
    expect(ctx.defaultModel).toBe('sonnet');
  });

  it('later steps can override earlier answers', async () => {
    const ctx: WizardContext = { userName: 'Initial' };
    const step: StepFn = async () => ({ answers: { userName: 'Updated' } });

    const result = await step(ctx, { index: 1, total: 1, name: 'T', codename: 'T' });
    Object.assign(ctx, result.answers);

    expect(ctx.userName).toBe('Updated');
  });
});

describe('Step Definitions Registry Pattern', () => {
  it('step definitions can be loaded as an ordered array', () => {
    const steps: StepDefinition[] = [
      { name: 'Choice', codename: 'The Choice', run: async () => ({ answers: {} }) },
      {
        name: 'Identity',
        codename: 'Identity',
        run: async () => ({ answers: { userName: 'Neo' } }),
      },
      { name: 'Link', codename: 'Claude Link', run: async () => ({ answers: {} }) },
    ];

    expect(steps).toHaveLength(3);
    expect(steps[0].name).toBe('Choice');
    expect(steps[2].codename).toBe('Claude Link');
  });

  it('slicing for red pill skips first (choice) and last (awakening) steps', () => {
    const steps: StepDefinition[] = Array.from({ length: 11 }, (_, i) => ({
      name: `Step ${i + 1}`,
      codename: `Code ${i + 1}`,
      run: (async () => ({ answers: {} })) as StepFn,
    }));

    const middleSteps = steps.slice(1, -1);
    expect(middleSteps).toHaveLength(9);
    expect(middleSteps[0].name).toBe('Step 2');
    expect(middleSteps[middleSteps.length - 1].name).toBe('Step 10');
  });

  it('red pill loop offsets step index correctly', async () => {
    const recorded: number[] = [];
    const steps: StepDefinition[] = Array.from({ length: 3 }, (_, i) => ({
      name: `Step ${i}`,
      codename: `Code ${i}`,
      run: (async (_ctx: WizardContext, meta: StepMeta) => {
        recorded.push(meta.index);
        return { answers: {} };
      }) as StepFn,
    }));

    const ctx: WizardContext = {};
    for (let i = 0; i < steps.length; i++) {
      const meta = {
        index: i + 2, // offset mirrors wizard.ts runRedPill
        total: 11,
        name: steps[i].name,
        codename: steps[i].codename,
      };
      const result = await steps[i].run(ctx, meta);
      Object.assign(ctx, result.answers);
    }

    expect(recorded).toEqual([2, 3, 4]);
  });
});

describe('Blue Pill Defaults', () => {
  it('blue pill path uses WIZARD_DEFAULTS as base', async () => {
    // Import WIZARD_DEFAULTS to verify structure
    const { WIZARD_DEFAULTS } = await import('@neo-agent/shared');

    expect(WIZARD_DEFAULTS.agentName).toBe('Neo');
    expect(WIZARD_DEFAULTS.userName).toBe('Human');
    expect(WIZARD_DEFAULTS.verbosity).toBeDefined();
    expect(WIZARD_DEFAULTS.defaultModel).toBeDefined();
  });

  it('blue pill merges user overrides into defaults', async () => {
    const { WIZARD_DEFAULTS } = await import('@neo-agent/shared');

    const bluePillResult = {
      ...WIZARD_DEFAULTS,
      userName: 'Alice',
      telegramBotToken: '12345:TOKEN',
    };

    // Overridden
    expect(bluePillResult.userName).toBe('Alice');
    expect(bluePillResult.telegramBotToken).toBe('12345:TOKEN');
    // Defaults preserved
    expect(bluePillResult.agentName).toBe('Neo');
    expect(bluePillResult.defaultModel).toBeDefined();
  });

  it('blue pill omits telegramBotToken when empty', async () => {
    const { WIZARD_DEFAULTS } = await import('@neo-agent/shared');

    const emptyToken = '' || undefined;
    const bluePillResult = {
      ...WIZARD_DEFAULTS,
      userName: 'Bob',
      telegramBotToken: emptyToken,
    };

    expect(bluePillResult.telegramBotToken).toBeUndefined();
  });
});

describe('Red Pill Assembly', () => {
  it('merges WIZARD_DEFAULTS with collected context and extra fields', async () => {
    const { WIZARD_DEFAULTS } = await import('@neo-agent/shared');

    const collectedCtx: WizardContext = {
      userName: 'Morpheus',
      agentName: 'Trinity',
      defaultModel: 'opus',
      port: 8080,
    };

    const redPillResult = {
      ...WIZARD_DEFAULTS,
      ...collectedCtx,
      dailyLogCron: '0 23 * * *',
      maxStories: 5,
    };

    // Overrides from collected context
    expect(redPillResult.userName).toBe('Morpheus');
    expect(redPillResult.agentName).toBe('Trinity');
    expect(redPillResult.defaultModel).toBe('opus');
    expect(redPillResult.port).toBe(8080);

    // Extra fields from runRedPill
    expect(redPillResult.dailyLogCron).toBe('0 23 * * *');
    expect(redPillResult.maxStories).toBe(5);

    // Defaults for uncollected fields
    expect(redPillResult.verbosity).toBeDefined();
  });
});
