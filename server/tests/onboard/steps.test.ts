/**
 * Tests for onboard wizard step modules.
 *
 * All steps use @clack/prompts for interactive input — we mock it to
 * return predetermined values and verify each step returns the expected
 * WizardAnswers shape.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ─── Mock @clack/prompts ────────────────────────────────────────────────────

const mockSpinner = {
  start: vi.fn(),
  stop: vi.fn(),
};

vi.mock('@clack/prompts', () => ({
  select: vi.fn(),
  text: vi.fn(),
  confirm: vi.fn(),
  spinner: vi.fn(() => mockSpinner),
  isCancel: vi.fn(() => false),
  cancel: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), success: vi.fn() },
}));

// Mock child_process for step 03 (claude link)
vi.mock('child_process', () => ({
  execSync: vi.fn(() => 'claude 1.2.3'),
}));

// Mock generators for step 11 (awakening)
vi.mock('../../src/onboard/generators.js', () => ({
  generateEnvFile: vi.fn(),
  generateWorkspaceFiles: vi.fn(() => ({ generated: [], skipped: [] })),
  initDatabase: vi.fn(),
  generateClaudeSettings: vi.fn(),
}));

// Mock progress
vi.mock('../../src/onboard/progress.js', () => ({
  showStepHeader: vi.fn(),
  showStepComplete: vi.fn(),
}));

const clack = await import('@clack/prompts');

const META = {
  index: 1,
  total: 11,
  codename: 'test-step',
  section: 'Testing',
};

// ─── Step 01: The Choice ─────────────────────────────────────────────────────

describe('Step 01 — The Choice', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns red pill when selected', async () => {
    vi.mocked(clack.select).mockResolvedValueOnce('red');
    const { run } = await import('../../src/onboard/steps/01-choice');
    const result = await run({}, META);
    expect(result.answers.pill).toBe('red');
  });

  it('returns blue pill when selected', async () => {
    vi.mocked(clack.select).mockResolvedValueOnce('blue');
    const { run } = await import('../../src/onboard/steps/01-choice');
    const result = await run({}, META);
    expect(result.answers.pill).toBe('blue');
  });
});

// ─── Step 02: Identity ───────────────────────────────────────────────────────

describe('Step 02 — Identity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all identity fields', async () => {
    vi.mocked(clack.text)
      .mockResolvedValueOnce('Alice') // userName
      .mockResolvedValueOnce('Morpheus'); // agentName
    vi.mocked(clack.select)
      .mockResolvedValueOnce('full-existential-crisis') // personalityIntensity
      .mockResolvedValueOnce('balanced'); // verbosity
    const { run } = await import('../../src/onboard/steps/02-identity');
    const result = await run({}, META);
    expect(result.answers).toMatchObject({
      userName: 'Alice',
      agentName: 'Morpheus',
      personalityIntensity: 'full-existential-crisis',
      verbosity: 'balanced',
    });
  });

  it('defaults agentName to Neo when empty', async () => {
    vi.mocked(clack.text).mockResolvedValueOnce('Bob').mockResolvedValueOnce(''); // empty → defaults to 'Neo'
    vi.mocked(clack.select).mockResolvedValueOnce('minimal').mockResolvedValueOnce('concise');
    const { run } = await import('../../src/onboard/steps/02-identity');
    const result = await run({}, META);
    expect(result.answers.agentName).toBe('Neo');
  });
});

// ─── Step 03: Claude Link ────────────────────────────────────────────────────

describe('Step 03 — Claude Link', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns permissionMode when Claude CLI found', async () => {
    vi.mocked(clack.select).mockResolvedValueOnce('default');
    const { run } = await import('../../src/onboard/steps/03-claude-link');
    const result = await run({}, META);
    expect(result.answers).toMatchObject({ permissionMode: 'default' });
  });

  it('returns bypassPermissions when selected', async () => {
    vi.mocked(clack.select).mockResolvedValueOnce('bypassPermissions');
    const { run } = await import('../../src/onboard/steps/03-claude-link');
    const result = await run({}, META);
    expect(result.answers.permissionMode).toBe('bypassPermissions');
  });
});

// ─── Step 04: The Construct ──────────────────────────────────────────────────

describe('Step 04 — The Construct', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns model, dashboard flag, port, and wsPort', async () => {
    vi.mocked(clack.select).mockResolvedValueOnce('sonnet');
    vi.mocked(clack.confirm).mockResolvedValueOnce(true);
    vi.mocked(clack.text).mockResolvedValueOnce('3141');
    const { run } = await import('../../src/onboard/steps/04-construct');
    const result = await run({}, META);
    expect(result.answers).toMatchObject({
      defaultModel: 'sonnet',
      enableDashboard: true,
      port: 3141,
      wsPort: 3142,
    });
  });

  it('calculates wsPort as port + 1', async () => {
    vi.mocked(clack.select).mockResolvedValueOnce('opus');
    vi.mocked(clack.confirm).mockResolvedValueOnce(false);
    vi.mocked(clack.text).mockResolvedValueOnce('4000');
    const { run } = await import('../../src/onboard/steps/04-construct');
    const result = await run({}, META);
    expect(result.answers.port).toBe(4000);
    expect(result.answers.wsPort).toBe(4001);
  });

  it('defaults port to 3141 for empty input', async () => {
    vi.mocked(clack.select).mockResolvedValueOnce('haiku');
    vi.mocked(clack.confirm).mockResolvedValueOnce(true);
    vi.mocked(clack.text).mockResolvedValueOnce('');
    const { run } = await import('../../src/onboard/steps/04-construct');
    const result = await run({}, META);
    expect(result.answers.port).toBe(3141);
  });
});

// ─── Step 05: Phone Lines ────────────────────────────────────────────────────

describe('Step 05 — Phone Lines', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns telegramBotToken', async () => {
    vi.mocked(clack.text).mockResolvedValueOnce('tg:bot-token');
    const { run } = await import('../../src/onboard/steps/05-phone-lines');
    const result = await run({}, META);
    expect(result.answers).toMatchObject({
      telegramBotToken: 'tg:bot-token',
    });
  });

  it('sets undefined for empty optional fields', async () => {
    vi.mocked(clack.text).mockResolvedValueOnce('');
    const { run } = await import('../../src/onboard/steps/05-phone-lines');
    const result = await run({}, META);
    expect(result.answers.telegramBotToken).toBeUndefined();
  });
});

// ─── Step 06: Free Will ──────────────────────────────────────────────────────

describe('Step 06 — Free Will', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns gatePhrase and default protectedPaths', async () => {
    vi.mocked(clack.text).mockResolvedValueOnce('execute now');
    const { run } = await import('../../src/onboard/steps/06-free-will');
    const result = await run({}, META);
    expect(result.answers.gatePhrase).toBe('execute now');
    expect(result.answers.protectedPaths).toEqual(['~/.ssh/', '~/.gnupg/', '.env']);
  });

  it('defaults gatePhrase to "do it" when empty', async () => {
    vi.mocked(clack.text).mockResolvedValueOnce('');
    const { run } = await import('../../src/onboard/steps/06-free-will');
    const result = await run({}, META);
    expect(result.answers.gatePhrase).toBe('do it');
  });
});

// ─── Step 07: Déjà Vu ───────────────────────────────────────────────────────

describe('Step 07 — Déjà Vu', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns fadeThreshold', async () => {
    vi.mocked(clack.text).mockResolvedValueOnce('0.9');
    const { run } = await import('../../src/onboard/steps/07-deja-vu');
    const result = await run({}, META);
    expect(result.answers.fadeThreshold).toBe(0.9);
  });

  it('defaults fadeThreshold to 0.85 for empty', async () => {
    vi.mocked(clack.text).mockResolvedValueOnce('');
    const { run } = await import('../../src/onboard/steps/07-deja-vu');
    const result = await run({}, META);
    expect(result.answers.fadeThreshold).toBe(0.85);
  });
});

// ─── Step 08: Dodge This ─────────────────────────────────────────────────────

describe('Step 08 — Dodge This', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns selected routingProfile', async () => {
    vi.mocked(clack.select).mockResolvedValueOnce('eco');
    const { run } = await import('../../src/onboard/steps/08-dodge-this');
    const result = await run({}, META);
    expect(result.answers.routingProfile).toBe('eco');
  });

  it('handles premium profile', async () => {
    vi.mocked(clack.select).mockResolvedValueOnce('premium');
    const { run } = await import('../../src/onboard/steps/08-dodge-this');
    const result = await run({}, META);
    expect(result.answers.routingProfile).toBe('premium');
  });
});

// ─── Step 09: Matrix Sync ────────────────────────────────────────────────────

describe('Step 09 — Matrix Sync', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns syncRepo URL when provided', async () => {
    vi.mocked(clack.text).mockResolvedValueOnce('git@github.com:user/memories.git');
    const { run } = await import('../../src/onboard/steps/09-matrix-sync');
    const result = await run({}, META);
    expect(result.answers.syncRepo).toBe('git@github.com:user/memories.git');
  });

  it('returns undefined syncRepo when skipped', async () => {
    vi.mocked(clack.text).mockResolvedValueOnce('');
    const { run } = await import('../../src/onboard/steps/09-matrix-sync');
    const result = await run({}, META);
    expect(result.answers.syncRepo).toBeUndefined();
  });
});

// ─── Step 10: Kung Fu ────────────────────────────────────────────────────────

describe('Step 10 — Kung Fu', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty answers and scans skills dir', async () => {
    const { run } = await import('../../src/onboard/steps/10-kung-fu');
    const result = await run({}, META);
    expect(result.answers).toEqual({});
    // skipped is true when no skills found, false when skills exist
    expect(typeof result.skipped).toBe('boolean');
  });
});

// ─── Step 11: Awakening ──────────────────────────────────────────────────────

describe('Step 11 — Awakening', () => {
  beforeEach(() => vi.clearAllMocks());

  it('runs generators and returns empty answers', async () => {
    const { generateEnvFile, generateWorkspaceFiles, initDatabase, generateClaudeSettings } =
      await import('../../src/onboard/generators.js');

    const ctx = {
      userName: 'Neo',
      agentName: 'Neo',
      personalityIntensity: 'full-existential-crisis',
      verbosity: 'balanced',
      permissionMode: 'default',
      defaultModel: 'sonnet',
      port: 3141,
      wsPort: 3142,
      gatePhrase: 'do it',
      protectedPaths: ['~/.ssh/'],
      routingProfile: 'auto',
      fadeThreshold: 0.85,
      dailyLogCron: '0 0 * * *',
      maxStories: 10,
      enableDashboard: true,
    } as any;

    const { run } = await import('../../src/onboard/steps/11-awakening');
    const result = await run(ctx, META);

    expect(generateEnvFile).toHaveBeenCalledWith(ctx);
    expect(generateWorkspaceFiles).toHaveBeenCalled();
    expect(initDatabase).toHaveBeenCalled();
    expect(generateClaudeSettings).toHaveBeenCalled();
    expect(result.answers).toEqual({});
  });
});
