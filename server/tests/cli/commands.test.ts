import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandDeps } from '../../src/cli/lib/commands';
import { handleCommand } from '../../src/cli/lib/commands';

// Mock external dependencies
vi.mock('../../src/channels/command-registry.js', () => ({
  getCommandsForChannel: vi.fn(() => [
    { command: '/help', description: 'Show commands', channels: ['cli'] },
    { command: '/stats', description: 'Show stats', channels: ['cli'] },
  ]),
}));

vi.mock('../../src/data/matrix-quotes.js', () => ({
  getQuote: vi.fn(() => 'There is no spoon.'),
}));

vi.mock('../../src/utils/logger.js', () => ({
  getRecentLogs: vi.fn(() => []),
  logger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../src/utils/terminal.js', () => ({
  color: new Proxy(
    {},
    {
      get: () => (s: string) => s,
    },
  ),
  digitalRain: vi.fn(() => '~~~'),
  gradient: vi.fn((s: string) => s),
  matrixBox: vi.fn((_title: string, lines: string[]) => lines.join('\n')),
  status: {
    ok: (s: string) => `OK: ${s}`,
    info: (s: string) => `INFO: ${s}`,
    warn: (s: string) => `WARN: ${s}`,
    error: (s: string) => `ERROR: ${s}`,
  },
}));

vi.mock('../../src/utils/patterns.js', () => ({
  VALID_ROUTING_PROFILES: ['auto', 'eco', 'balanced', 'premium'] as const,
  VALID_MODEL_TIERS: ['haiku', 'sonnet', 'opus'] as const,
}));

vi.mock('../../src/cli/lib/format.js', () => ({
  buildBanner: vi.fn(() => '=== BANNER ==='),
  buildPrompt: vi.fn((id: string) => `[${id}] > `),
  fmtCost: vi.fn((n: number) => `$${n.toFixed(2)}`),
  fmtTokens: vi.fn((n: number) => String(n)),
  sessionInfo: vi.fn(() => 'session:test turns:0 tokens:0 cost:$0.00'),
}));

describe('handleCommand', () => {
  let deps: CommandDeps;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    deps = {
      sessionMgr: {
        current: {
          id: 'test-session',
          turns: 5,
          totalInputTokens: 1000,
          totalOutputTokens: 500,
          totalCost: 0.05,
          startedAt: Date.now(),
        },
        create: vi.fn(() => {
          const newSession = {
            id: 'new-session',
            turns: 0,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            totalCost: 0,
            startedAt: Date.now(),
          };
          (deps.sessionMgr as any).current = newSession;
          return newSession;
        }),
        switchTo: vi.fn((name: string) => {
          const session = {
            id: name,
            turns: 3,
            totalInputTokens: 100,
            totalOutputTokens: 50,
            totalCost: 0.01,
            startedAt: Date.now(),
          };
          (deps.sessionMgr as any).current = session;
          return session;
        }),
        has: vi.fn(() => false),
        all: vi.fn(
          () =>
            new Map([
              [
                'test-session',
                {
                  id: 'test-session',
                  turns: 5,
                  totalInputTokens: 1000,
                  totalOutputTokens: 500,
                  totalCost: 0.05,
                  startedAt: Date.now(),
                },
              ],
            ]),
        ),
        save: vi.fn(),
      } as any,
      longTermMemory: {
        count: vi.fn(() => 3),
        getRecent: vi.fn(() => []),
        store: vi.fn(),
      } as any,
      memorySearch: {
        search: vi.fn(() => []),
      } as any,
      routingProfile: 'auto' as any,
      setRoutingProfile: vi.fn(),
      refreshSystemPrompt: vi.fn(),
      rl: {
        setPrompt: vi.fn(),
        prompt: vi.fn(),
      },
      compact: vi.fn(() => Promise.resolve()),
      retry: vi.fn(() => Promise.resolve()),
      setModelOverride: vi.fn(),
      exportTranscript: vi.fn(() => Promise.resolve()),
    };
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'clear').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Non-commands return false ──────────────────────────────────

  it('returns false for non-command input', () => {
    expect(handleCommand('hello world', deps)).toBe(false);
  });

  it('returns false for empty input', () => {
    expect(handleCommand('', deps)).toBe(false);
  });

  it('returns false for text that starts with / but is not a command', () => {
    expect(handleCommand('/unknown', deps)).toBe(false);
  });

  // ─── /clear ─────────────────────────────────────────────────────

  it('/clear clears console, prints banner, prompts', () => {
    const result = handleCommand('/clear', deps);
    expect(result).toBe(true);
    expect(console.clear).toHaveBeenCalled();
    expect(deps.rl.prompt).toHaveBeenCalled();
  });

  // ─── /help ──────────────────────────────────────────────────────

  it('/help prints commands and prompts', () => {
    const result = handleCommand('/help', deps);
    expect(result).toBe(true);
    expect(deps.rl.prompt).toHaveBeenCalled();
  });

  // ─── /stats ─────────────────────────────────────────────────────

  it('/stats prints session stats and prompts', () => {
    const result = handleCommand('/stats', deps);
    expect(result).toBe(true);
    expect(deps.longTermMemory.count).toHaveBeenCalled();
    expect(deps.rl.prompt).toHaveBeenCalled();
  });

  // ─── /route ─────────────────────────────────────────────────────

  it('/route without argument shows current profile', () => {
    const result = handleCommand('/route', deps);
    expect(result).toBe(true);
    expect(deps.setRoutingProfile).not.toHaveBeenCalled();
    expect(deps.rl.prompt).toHaveBeenCalled();
  });

  it('/route eco sets eco profile', () => {
    const result = handleCommand('/route eco', deps);
    expect(result).toBe(true);
    expect(deps.setRoutingProfile).toHaveBeenCalledWith('eco');
  });

  it('/route balanced sets balanced profile', () => {
    const result = handleCommand('/route balanced', deps);
    expect(result).toBe(true);
    expect(deps.setRoutingProfile).toHaveBeenCalledWith('balanced');
  });

  it('/route premium sets premium profile', () => {
    const result = handleCommand('/route premium', deps);
    expect(result).toBe(true);
    expect(deps.setRoutingProfile).toHaveBeenCalledWith('premium');
  });

  it('/route auto sets auto profile', () => {
    const result = handleCommand('/route auto', deps);
    expect(result).toBe(true);
    expect(deps.setRoutingProfile).toHaveBeenCalledWith('auto');
  });

  it('/route invalid warns about unknown profile', () => {
    const result = handleCommand('/route garbage', deps);
    expect(result).toBe(true);
    expect(deps.setRoutingProfile).not.toHaveBeenCalled();
    expect(deps.rl.prompt).toHaveBeenCalled();
  });

  // ─── /memory ────────────────────────────────────────────────────

  it('/memory without query shows recent memories', () => {
    const result = handleCommand('/memory', deps);
    expect(result).toBe(true);
    expect(deps.longTermMemory.getRecent).toHaveBeenCalledWith(10);
    expect(deps.rl.prompt).toHaveBeenCalled();
  });

  it('/memory without query shows empty notice when no memories', () => {
    (deps.longTermMemory.getRecent as ReturnType<typeof vi.fn>).mockReturnValue([]);
    const result = handleCommand('/memory', deps);
    expect(result).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No memories yet'));
  });

  it('/memory without query lists recent memories when they exist', () => {
    (deps.longTermMemory.getRecent as ReturnType<typeof vi.fn>).mockReturnValue([
      { type: 'fact', content: 'User likes TypeScript' },
      { type: 'preference', content: 'Short responses preferred' },
    ]);
    const result = handleCommand('/memory', deps);
    expect(result).toBe(true);
    // Should print something for each memory
    expect(consoleSpy.mock.calls.length).toBeGreaterThan(2);
  });

  it('/memory with query searches memories', () => {
    const result = handleCommand('/memory typescript', deps);
    expect(result).toBe(true);
    expect(deps.memorySearch.search).toHaveBeenCalledWith('typescript');
    expect(deps.rl.prompt).toHaveBeenCalled();
  });

  it('/memory with query shows "no match" when results empty', () => {
    (deps.memorySearch.search as ReturnType<typeof vi.fn>).mockReturnValue([]);
    handleCommand('/memory something', deps);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No memories match'));
  });

  it('/memory with query lists results when found', () => {
    (deps.memorySearch.search as ReturnType<typeof vi.fn>).mockReturnValue([
      { source: 'long-term', content: 'Found memory item' },
    ]);
    handleCommand('/memory query', deps);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Found memory item'));
  });

  // ─── /remember ──────────────────────────────────────────────────

  it('/remember stores a fact', () => {
    const result = handleCommand('/remember User prefers dark mode', deps);
    expect(result).toBe(true);
    expect(deps.longTermMemory.store).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'fact',
        content: 'User prefers dark mode',
        importance: 0.9,
        tags: [],
        sourceSession: 'test-session',
      }),
    );
    expect(deps.refreshSystemPrompt).toHaveBeenCalled();
    expect(deps.rl.prompt).toHaveBeenCalled();
  });

  it('/remember with no content shows usage', () => {
    // Note: /remember without a space after it won't match the startsWith('/remember ') check
    // The command checks startsWith('/remember '), so '/remember' alone won't trigger it
    // '/remember ' with only spaces after will match but fact will be empty
    const result = handleCommand('/remember ', deps);
    expect(result).toBe(true);
    expect(deps.longTermMemory.store).not.toHaveBeenCalled();
  });

  // ─── /sessions ──────────────────────────────────────────────────

  it('/sessions lists all sessions', () => {
    const result = handleCommand('/sessions', deps);
    expect(result).toBe(true);
    expect(deps.sessionMgr.all).toHaveBeenCalled();
    expect(deps.rl.prompt).toHaveBeenCalled();
  });

  // ─── /new ───────────────────────────────────────────────────────

  it('/new creates a new session and updates prompt', () => {
    const result = handleCommand('/new', deps);
    expect(result).toBe(true);
    expect(deps.sessionMgr.create).toHaveBeenCalled();
    expect(deps.rl.setPrompt).toHaveBeenCalled();
    expect(deps.rl.prompt).toHaveBeenCalled();
  });

  // ─── /compact ───────────────────────────────────────────────────

  it('/compact calls compact and returns true', () => {
    const result = handleCommand('/compact', deps);
    expect(result).toBe(true);
    expect(deps.compact).toHaveBeenCalled();
  });

  // ─── /debug ─────────────────────────────────────────────────────

  it('/debug shows "no logs" when empty', () => {
    const result = handleCommand('/debug', deps);
    expect(result).toBe(true);
    expect(deps.rl.prompt).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No logs captured yet'));
  });

  it('/debug with namespace filters logs', async () => {
    const { getRecentLogs } = await import('../../src/utils/logger.js');
    (getRecentLogs as ReturnType<typeof vi.fn>).mockReturnValue([]);
    handleCommand('/debug bridge', deps);
    expect(getRecentLogs).toHaveBeenCalledWith(50, 'bridge');
  });

  it('/debug shows log entries when they exist', async () => {
    const { getRecentLogs } = await import('../../src/utils/logger.js');
    (getRecentLogs as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        timestamp: '2026-03-08T22:18:42.123Z',
        level: 'info',
        namespace: 'bridge',
        message: 'test log',
        data: {},
      },
    ]);
    handleCommand('/debug', deps);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('test log'));
  });

  it('/debug shows data JSON for entries with non-empty data', async () => {
    const { getRecentLogs } = await import('../../src/utils/logger.js');
    (getRecentLogs as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        timestamp: '2026-03-08T22:18:42.123Z',
        level: 'debug',
        namespace: 'test',
        message: 'with data',
        data: { key: 'value' },
      },
    ]);
    handleCommand('/debug', deps);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('{"key":"value"}'));
  });

  // ─── /retry ─────────────────────────────────────────────────────

  it('/retry calls retry and returns true', () => {
    const result = handleCommand('/retry', deps);
    expect(result).toBe(true);
    expect(deps.retry).toHaveBeenCalled();
  });

  // ─── /model ─────────────────────────────────────────────────────

  it('/model without argument shows usage', () => {
    const result = handleCommand('/model', deps);
    expect(result).toBe(true);
    expect(deps.setModelOverride).not.toHaveBeenCalled();
    expect(deps.rl.prompt).toHaveBeenCalled();
  });

  it('/model haiku sets model override', () => {
    const result = handleCommand('/model haiku', deps);
    expect(result).toBe(true);
    expect(deps.setModelOverride).toHaveBeenCalledWith('haiku');
  });

  it('/model sonnet sets model override', () => {
    const result = handleCommand('/model sonnet', deps);
    expect(result).toBe(true);
    expect(deps.setModelOverride).toHaveBeenCalledWith('sonnet');
  });

  it('/model opus sets model override', () => {
    const result = handleCommand('/model opus', deps);
    expect(result).toBe(true);
    expect(deps.setModelOverride).toHaveBeenCalledWith('opus');
  });

  it('/model invalid warns about unknown tier', () => {
    const result = handleCommand('/model gpt4', deps);
    expect(result).toBe(true);
    expect(deps.setModelOverride).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown tier'));
  });

  // ─── /export ────────────────────────────────────────────────────

  it('/export calls exportTranscript and returns true', () => {
    const result = handleCommand('/export', deps);
    expect(result).toBe(true);
    expect(deps.exportTranscript).toHaveBeenCalled();
  });

  // ─── /session <name> ────────────────────────────────────────────

  it('/session with name creates new session when not found', () => {
    (deps.sessionMgr.has as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const result = handleCommand('/session alpha', deps);
    expect(result).toBe(true);
    expect(deps.sessionMgr.create).toHaveBeenCalledWith('alpha');
    expect(deps.rl.setPrompt).toHaveBeenCalled();
    expect(deps.rl.prompt).toHaveBeenCalled();
  });

  it('/session with name switches to existing session', () => {
    (deps.sessionMgr.has as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const result = handleCommand('/session beta', deps);
    expect(result).toBe(true);
    expect(deps.sessionMgr.switchTo).toHaveBeenCalledWith('beta');
    expect(deps.rl.setPrompt).toHaveBeenCalled();
    expect(deps.rl.prompt).toHaveBeenCalled();
  });

  it('/session with empty name shows usage', () => {
    const result = handleCommand('/session ', deps);
    expect(result).toBe(true);
    expect(deps.sessionMgr.create).not.toHaveBeenCalled();
    expect(deps.sessionMgr.switchTo).not.toHaveBeenCalled();
  });

  // ─── /tasks ─────────────────────────────────────────────────────

  it('/tasks without taskRepo warns not available', () => {
    deps.taskRepo = undefined;
    const result = handleCommand('/tasks', deps);
    expect(result).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('not available'));
  });

  it('/tasks with empty task list shows hint', () => {
    deps.taskRepo = { list: vi.fn(() => []), create: vi.fn() } as any;
    const result = handleCommand('/tasks', deps);
    expect(result).toBe(true);
    expect(deps.taskRepo!.list).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No tasks yet'));
  });

  it('/tasks with tasks lists them grouped by status', () => {
    deps.taskRepo = {
      list: vi.fn(() => [
        {
          id: 'task-001-abcdefgh',
          title: 'Fix bug',
          status: 'in_progress',
          priority: 'high',
        },
        {
          id: 'task-002-abcdefgh',
          title: 'Add tests',
          status: 'backlog',
          priority: 'medium',
        },
      ]),
      create: vi.fn(),
    } as any;
    const result = handleCommand('/tasks', deps);
    expect(result).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Fix bug'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Add tests'));
  });

  // ─── /task <title> ──────────────────────────────────────────────

  it('/task without taskRepo warns not available', () => {
    deps.taskRepo = undefined;
    const result = handleCommand('/task Write docs', deps);
    expect(result).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('not available'));
  });

  it('/task with empty title shows usage', () => {
    deps.taskRepo = { list: vi.fn(), create: vi.fn() } as any;
    const result = handleCommand('/task ', deps);
    expect(result).toBe(true);
    expect(deps.taskRepo!.create).not.toHaveBeenCalled();
  });

  it('/task creates a new task', () => {
    const createdTask = {
      id: 'task-xyz-abcdefgh',
      title: 'Implement feature',
      status: 'backlog',
      priority: 'medium',
    };
    deps.taskRepo = {
      list: vi.fn(),
      create: vi.fn(() => createdTask),
    } as any;
    const result = handleCommand('/task Implement feature', deps);
    expect(result).toBe(true);
    expect(deps.taskRepo!.create).toHaveBeenCalledWith({
      title: 'Implement feature',
      createdBy: 'user',
    });
  });

  // ─── /dev ───────────────────────────────────────────────────

  it('/dev without setNeoDevMode warns not available', () => {
    deps.setNeoDevMode = undefined;
    const result = handleCommand('/dev', deps);
    expect(result).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('not available'));
  });

  it('/dev on enables dev mode', () => {
    deps.setNeoDevMode = vi.fn();
    const result = handleCommand('/dev on', deps);
    expect(result).toBe(true);
    expect(deps.setNeoDevMode).toHaveBeenCalledWith(true);
  });

  it('/dev off disables dev mode', () => {
    deps.setNeoDevMode = vi.fn();
    const result = handleCommand('/dev off', deps);
    expect(result).toBe(true);
    expect(deps.setNeoDevMode).toHaveBeenCalledWith(false);
  });

  it('/dev without argument shows current status (on)', () => {
    deps.setNeoDevMode = vi.fn();
    deps.neoDevMode = true;
    const result = handleCommand('/dev', deps);
    expect(result).toBe(true);
    expect(deps.setNeoDevMode).not.toHaveBeenCalled();
  });

  it('/dev without argument shows current status (off)', () => {
    deps.setNeoDevMode = vi.fn();
    deps.neoDevMode = false;
    const result = handleCommand('/dev', deps);
    expect(result).toBe(true);
    expect(deps.setNeoDevMode).not.toHaveBeenCalled();
  });

  // ─── /onboard ───────────────────────────────────────────────────

  it('/onboard returns a promise that resolves to true', async () => {
    // Mock child_process.execSync
    vi.mock('child_process', () => ({
      execSync: vi.fn(),
    }));
    const result = handleCommand('/onboard', deps);
    expect(result).toBeInstanceOf(Promise);
    const resolved = await result;
    expect(resolved).toBe(true);
    expect(deps.rl.prompt).toHaveBeenCalled();
  });

  // ─── Command return values ──────────────────────────────────────

  it('all recognized commands return true (synchronous)', () => {
    const syncCommands = [
      '/clear',
      '/help',
      '/stats',
      '/route',
      '/route eco',
      '/memory',
      '/sessions',
      '/new',
      '/compact',
      '/retry',
      '/model',
      '/model haiku',
      '/export',
    ];

    for (const cmd of syncCommands) {
      // Reset mocks between iterations
      vi.mocked(deps.rl.prompt).mockClear();
      const result = handleCommand(cmd, deps);
      // /compact and /retry return true synchronously (the promise is fire-and-forget)
      expect(result).toBe(true);
    }
  });
});
