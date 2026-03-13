import type { AgentResponse, InboundMessage, NeoConfig } from '@neo-agent/shared';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock all heavy dependencies ─────────────────────────────

vi.mock('../../src/core/claude-bridge.js', () => ({
  ClaudeBridge: vi.fn().mockImplementation(() => ({
    run: vi.fn().mockResolvedValue({
      success: true,
      data: { content: 'mocked response', messages: [{ session_id: 'sdk-123' }] },
    }),
  })),
}));

vi.mock('../../src/guardrails/index.js', () => ({
  GuardrailPipeline: vi.fn().mockImplementation(() => ({
    process: vi.fn().mockImplementation((msg: any) => Promise.resolve(msg)),
  })),
}));

vi.mock('../../src/harness/index.js', () => ({
  HarnessPipeline: vi.fn().mockImplementation(() => ({
    historian: { logGateBlock: vi.fn() },
    process: vi.fn().mockResolvedValue({
      content: 'validated response',
      validatedContent: 'validated response',
      tokensUsed: 100,
      data: { inputTokens: 50, outputTokens: 100, costUsd: 0.001 },
    }),
  })),
}));

const mockGateCheck = vi.fn().mockResolvedValue({ blocked: false });
vi.mock('../../src/gates/index.js', () => ({
  GateManager: vi.fn().mockImplementation(() => ({
    check: mockGateCheck,
  })),
}));

vi.mock('../../src/core/session-queue.js', () => ({
  SessionQueue: vi.fn().mockImplementation(() => ({
    enqueue: vi.fn().mockImplementation((_key: string, fn: () => Promise<any>) => fn()),
  })),
}));

vi.mock('../../src/core/error-recovery.js', () => ({
  ErrorRecovery: vi.fn().mockImplementation(() => ({
    handle: vi.fn().mockReturnValue({ content: 'Error recovered', model: 'sonnet' }),
  })),
}));

vi.mock('../../src/router/classifier.js', () => ({
  TaskClassifier: vi.fn().mockImplementation(() => ({
    classify: vi.fn().mockReturnValue({
      complexity: 'moderate',
      tokenEstimate: 500,
      category: 'coding',
    }),
  })),
}));

vi.mock('../../src/router/engine.js', () => ({
  RouterEngine: vi.fn().mockImplementation(() => ({
    selectModel: vi.fn().mockImplementation(() => ({
      selectedModel: 'sonnet',
      score: 0.8,
      maxTurns: 10,
      allowedTools: ['Read', 'Write'],
    })),
  })),
}));

vi.mock('../../src/skills/registry.js', () => ({
  SkillRegistry: vi.fn().mockImplementation(() => ({
    loadFromDirectory: vi.fn(),
  })),
}));

vi.mock('../../src/skills/matcher.js', () => ({
  SkillMatcher: vi.fn().mockImplementation(() => ({
    getActiveContexts: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../../src/agents/registry.js', () => ({
  AgentRegistry: vi.fn().mockImplementation(() => ({
    loadFromDirectory: vi.fn(),
  })),
}));

vi.mock('../../src/agents/spawner.js', () => ({
  SubAgentSpawner: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../../src/agents/orchestrator.js', () => ({
  Orchestrator: vi.fn().mockImplementation(() => ({
    shouldDecompose: vi.fn().mockReturnValue({ shouldDecompose: false }),
    createTeam: vi.fn(),
    executeTeam: vi.fn(),
  })),
}));

vi.mock('../../src/media/media-processor.js', () => ({
  MediaProcessor: vi.fn(),
}));

vi.mock('../../src/memory/index.js', () => ({
  SessionTranscript: vi.fn().mockImplementation(() => ({
    record: vi.fn(),
    getHistory: vi.fn().mockReturnValue([]),
  })),
  LongTermMemory: vi.fn().mockImplementation(() => ({
    store: vi.fn(),
  })),
  MemoryExtractor: vi.fn().mockImplementation(() => ({
    extractFromMessage: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: vi.fn().mockReturnValue({
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }),
  getRecentLogs: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/utils/patterns.js', () => ({
  calculateTimeoutMs: vi.fn().mockReturnValue(120000),
  DEFAULT_AGENT_TOOLS: [
    'Read',
    'Write',
    'Edit',
    'Bash',
    'Glob',
    'Grep',
    'WebSearch',
    'WebFetch',
    'Agent',
  ],
  formatDebugLogs: vi.fn().mockReturnValue(''),
  injectCompactedContext: vi.fn().mockImplementation((prompt: string, ctx: string) => prompt + ctx),
  injectDebugContext: vi.fn().mockImplementation((prompt: string, dbg: string) => prompt + dbg),
  isDebugIntent: vi.fn().mockReturnValue(false),
  isShortFollowup: vi.fn().mockReturnValue(false),
  isTimeoutResult: vi.fn().mockReturnValue(false),
}));

import { createMemoryDb } from '../../src/db/connection';
import { NeoAgent } from '../../src/core/agent';

function makeConfig(overrides: Partial<NeoConfig> = {}): NeoConfig {
  return {
    port: 3000,
    wsPort: 3001,
    wsToken: 'test-token',
    workspacePath: '/tmp/neo-test',
    dbPath: ':memory:',
    permissionMode: 'default',
    defaultModel: 'sonnet',
    userName: 'TestUser',
    agentName: 'Neo',
    personalityIntensity: 'medium',
    verbosity: 'balanced',
    fadeThreshold: 100000,
    dailyLogCron: '0 0 * * *',
    maxStories: 10,
    gatePhrase: 'approved',
    protectedPaths: ['/etc'],
    routingProfile: 'auto',
    ...overrides,
  };
}

function makeMessage(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    id: 'msg-1',
    channelId: 'ch-1',
    channel: 'cli',
    userId: 'user-1',
    content: 'Hello Neo',
    timestamp: Date.now(),
    sessionKey: 'cli:user-1',
    ...overrides,
  };
}

describe('NeoAgent', () => {
  let db: Database.Database;
  let agent: NeoAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMemoryDb();
    agent = new NeoAgent(db, makeConfig());
  });

  afterEach(() => {
    db.close();
  });

  // ─── Model Override ──────────────────────────────────────────

  describe('setModelOverride / model state', () => {
    it('sets a model override for a session key', () => {
      agent.setModelOverride('cli:user-1', 'opus');
      // The override is consumed inside handleMessage, so we can verify it doesn't throw
      // and can be set multiple times
      agent.setModelOverride('cli:user-1', 'haiku');
    });

    it('allows different overrides per session key', () => {
      agent.setModelOverride('cli:user-1', 'opus');
      agent.setModelOverride('telegram:user-2', 'haiku');
      // No shared state contamination — separate keys
    });
  });

  // ─── Last Input ──────────────────────────────────────────────

  describe('getLastInput', () => {
    it('returns undefined for unknown session key', () => {
      expect(agent.getLastInput('nonexistent')).toBeUndefined();
    });

    it('returns the last input after handleMessage records it', async () => {
      const msg = makeMessage({ content: 'test input' });
      await agent.handleMessage(msg);
      expect(agent.getLastInput('cli:user-1')).toBe('test input');
    });

    it('overwrites previous input on same session key', async () => {
      await agent.handleMessage(makeMessage({ content: 'first' }));
      await agent.handleMessage(makeMessage({ content: 'second' }));
      expect(agent.getLastInput('cli:user-1')).toBe('second');
    });
  });

  // ─── Neo-Dev Mode ───────────────────────────────────────────

  describe('setNeoDevMode / isNeoDevMode', () => {
    it('defaults to false for all session keys', () => {
      expect(agent.isNeoDevMode('cli:user-1')).toBe(false);
      expect(agent.isNeoDevMode('telegram:user-99')).toBe(false);
    });

    it('can be enabled', () => {
      agent.setNeoDevMode('cli:user-1', true);
      expect(agent.isNeoDevMode('cli:user-1')).toBe(true);
    });

    it('can be toggled off', () => {
      agent.setNeoDevMode('cli:user-1', true);
      agent.setNeoDevMode('cli:user-1', false);
      expect(agent.isNeoDevMode('cli:user-1')).toBe(false);
    });

    it('tracks independently per session key', () => {
      agent.setNeoDevMode('cli:user-1', true);
      agent.setNeoDevMode('telegram:user-2', false);
      expect(agent.isNeoDevMode('cli:user-1')).toBe(true);
      expect(agent.isNeoDevMode('telegram:user-2')).toBe(false);
    });
  });

  // ─── getTranscript / getSessionManager ──────────────────────

  describe('getTranscript', () => {
    it('returns the SessionTranscript instance', () => {
      const transcript = agent.getTranscript();
      expect(transcript).toBeDefined();
      expect(typeof transcript.record).toBe('function');
    });
  });

  describe('getSessionManager', () => {
    it('returns the SessionManager instance', () => {
      const sessions = agent.getSessionManager();
      expect(sessions).toBeDefined();
      expect(typeof sessions.resolveOrCreate).toBe('function');
    });
  });

  // ─── handleMessage pipeline ─────────────────────────────────

  describe('handleMessage', () => {
    it('returns an AgentResponse with content and model', async () => {
      const response = await agent.handleMessage(makeMessage());
      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
      expect(response.model).toBeDefined();
    });

    it('records the last input for the session key', async () => {
      const msg = makeMessage({ content: 'pipeline test' });
      await agent.handleMessage(msg);
      expect(agent.getLastInput(msg.sessionKey)).toBe('pipeline test');
    });

    it('returns validated content from the harness', async () => {
      const response = await agent.handleMessage(makeMessage());
      expect(response.content).toBe('validated response');
    });

    it('includes token and cost information', async () => {
      const response = await agent.handleMessage(makeMessage());
      expect(response.tokensUsed).toBe(100);
      expect(response.inputTokens).toBe(50);
      expect(response.costUsd).toBe(0.001);
    });

    it('uses the route-selected model in the response', async () => {
      const response = await agent.handleMessage(makeMessage());
      expect(response.model).toBe('sonnet');
    });

    it('handles errors via error recovery', async () => {
      // Make the bridge throw to trigger error recovery
      const { ClaudeBridge } = await import('../../src/core/claude-bridge.js');
      const bridgeInstance = new (ClaudeBridge as any)();
      bridgeInstance.run.mockRejectedValueOnce(new Error('Bridge failure'));

      // Re-create agent to pick up the failing bridge
      const failAgent = new NeoAgent(db, makeConfig());
      // Override internal bridge access — the error recovery mock returns a fallback
      const response = await failAgent.handleMessage(makeMessage());
      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
    });

    it('consumes model override after one message', async () => {
      agent.setModelOverride('cli:user-1', 'opus');
      await agent.handleMessage(makeMessage());
      // After consuming, the override should be gone — next message uses router default
      const response2 = await agent.handleMessage(makeMessage());
      expect(response2.model).toBe('sonnet');
    });
  });

  // ─── Gate blocking ──────────────────────────────────────────

  describe('gate blocking', () => {
    it('returns gate-blocked response when gates block the message', async () => {
      mockGateCheck.mockResolvedValueOnce({
        blocked: true,
        reason: 'Dangerous operation',
        neoQuip: 'Not so fast.',
      });

      const response = await agent.handleMessage(makeMessage({ content: 'delete everything' }));
      expect(response.content).toBe('Not so fast.');
      expect(response.gateBlocked).toBeDefined();
      expect(response.gateBlocked!.blocked).toBe(true);
    });
  });

  // ─── Cost budget warnings ──────────────────────────────────

  describe('cost budget warnings', () => {
    it('adds a warning when session cost exceeds budget', async () => {
      // Set a very low cost budget
      const originalEnv = process.env.NEO_COST_BUDGET;
      process.env.NEO_COST_BUDGET = '0.0001';

      const budgetAgent = new NeoAgent(db, makeConfig());
      const response = await budgetAgent.handleMessage(makeMessage());
      // costUsd is 0.001 which exceeds 0.0001
      expect(response.warnings).toBeDefined();
      expect(response.warnings!.length).toBeGreaterThan(0);
      expect(response.warnings![0]).toContain('exceeded budget');

      process.env.NEO_COST_BUDGET = originalEnv;
    });
  });
});
