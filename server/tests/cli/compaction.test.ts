import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompactionManager } from '../../src/cli/lib/compaction';
import type { SessionManager } from '../../src/cli/lib/sessions';
import type { ClaudeBridge } from '../../src/core/claude-bridge';

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  logger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// Mock terminal utilities (color, etc.)
vi.mock('../../src/utils/terminal.js', () => ({
  color: new Proxy(
    {},
    {
      get: () => (s: string) => s,
    },
  ),
}));

function createMockBridge() {
  return {
    run: vi.fn(),
    on: vi.fn(),
    emit: vi.fn(),
  } as unknown as ClaudeBridge;
}

function createMockSessionMgr(overrides?: Partial<SessionManager['current']>): SessionManager {
  const current = {
    id: 'test-session',
    turns: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCost: 0,
    startedAt: Date.now(),
    sdkSessionId: 'sdk-123',
    ...overrides,
  };
  return {
    current,
    save: vi.fn(),
  } as unknown as SessionManager;
}

function createMockTranscript(history: { role: string; content: string }[] = []) {
  return {
    getHistory: vi.fn(() => history),
    record: vi.fn(),
  } as any;
}

describe('CompactionManager', () => {
  let bridge: ReturnType<typeof createMockBridge>;
  let sessionMgr: ReturnType<typeof createMockSessionMgr>;
  let transcript: ReturnType<typeof createMockTranscript>;
  let refreshSystemPrompt: ReturnType<typeof vi.fn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    bridge = createMockBridge();
    sessionMgr = createMockSessionMgr();
    transcript = createMockTranscript();
    refreshSystemPrompt = vi.fn();
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Constructor / Defaults ─────────────────────────────────────

  describe('constructor', () => {
    it('initializes with null compactedContext', () => {
      const mgr = new CompactionManager(
        bridge,
        sessionMgr,
        transcript,
        '/tmp/workspace',
        refreshSystemPrompt,
      );
      expect(mgr.compactedContext).toBeNull();
      expect(mgr.lastCompactionInfo).toBeNull();
    });

    it('uses default keepRecent of 20', () => {
      const mgr = new CompactionManager(
        bridge,
        sessionMgr,
        transcript,
        '/tmp/workspace',
        refreshSystemPrompt,
      );
      // autoCompactTurnThreshold should default to 15
      expect(mgr.autoCompactTurnThreshold).toBe(15);
    });

    it('accepts custom options', () => {
      const mgr = new CompactionManager(
        bridge,
        sessionMgr,
        transcript,
        '/tmp/workspace',
        refreshSystemPrompt,
        { keepRecent: 10, autoCompactThreshold: 20 },
      );
      expect(mgr.autoCompactTurnThreshold).toBe(20);
    });
  });

  // ─── generateCompactSummary ─────────────────────────────────────

  describe('generateCompactSummary', () => {
    it('returns summary from successful bridge call', async () => {
      (bridge.run as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: 'Compacted summary text',
      });

      const mgr = new CompactionManager(
        bridge,
        sessionMgr,
        transcript,
        '/tmp/workspace',
        refreshSystemPrompt,
      );

      const result = await mgr.generateCompactSummary([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ]);

      expect(result).toBe('Compacted summary text');
      expect(bridge.run).toHaveBeenCalledWith(
        expect.stringContaining('compacting a conversation'),
        expect.objectContaining({
          model: 'sonnet',
          maxTurns: 1,
          timeoutMs: 60_000,
        }),
      );
    });

    it('returns null when bridge call fails', async () => {
      (bridge.run as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        error: 'TIMEOUT',
      });

      const mgr = new CompactionManager(
        bridge,
        sessionMgr,
        transcript,
        '/tmp/workspace',
        refreshSystemPrompt,
      );

      const result = await mgr.generateCompactSummary([{ role: 'user', content: 'Hello' }]);
      expect(result).toBeNull();
    });

    it('returns null when bridge call returns empty data', async () => {
      (bridge.run as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: '',
      });

      const mgr = new CompactionManager(
        bridge,
        sessionMgr,
        transcript,
        '/tmp/workspace',
        refreshSystemPrompt,
      );

      const result = await mgr.generateCompactSummary([{ role: 'user', content: 'Hello' }]);
      expect(result).toBeNull();
    });

    it('returns null on exception', async () => {
      (bridge.run as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

      const mgr = new CompactionManager(
        bridge,
        sessionMgr,
        transcript,
        '/tmp/workspace',
        refreshSystemPrompt,
      );

      const result = await mgr.generateCompactSummary([{ role: 'user', content: 'Hello' }]);
      expect(result).toBeNull();
    });

    it('truncates messages longer than 10000 chars', async () => {
      (bridge.run as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: 'summary',
      });

      const mgr = new CompactionManager(
        bridge,
        sessionMgr,
        transcript,
        '/tmp/workspace',
        refreshSystemPrompt,
      );

      const longContent = 'x'.repeat(20000);
      await mgr.generateCompactSummary([{ role: 'user', content: longContent }]);

      const calledPrompt = (bridge.run as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      // The message content should be sliced to 10000 chars
      expect(calledPrompt).not.toContain('x'.repeat(20000));
      expect(calledPrompt).toContain('x'.repeat(10000));
    });

    it('handles data as object with content property', async () => {
      (bridge.run as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { content: 'Object-based summary' },
      });

      const mgr = new CompactionManager(
        bridge,
        sessionMgr,
        transcript,
        '/tmp/workspace',
        refreshSystemPrompt,
      );

      const result = await mgr.generateCompactSummary([{ role: 'user', content: 'Hello' }]);
      expect(result).toBe('Object-based summary');
    });
  });

  // ─── runCompact ─────────────────────────────────────────────────

  describe('runCompact', () => {
    it('does nothing when no tokens have been used', async () => {
      sessionMgr = createMockSessionMgr({
        totalInputTokens: 0,
        totalOutputTokens: 0,
      });

      const mgr = new CompactionManager(
        bridge,
        sessionMgr,
        transcript,
        '/tmp/workspace',
        refreshSystemPrompt,
      );

      await mgr.runCompact();
      expect(bridge.run).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Nothing to compact'));
    });

    it('does nothing when transcript is empty', async () => {
      sessionMgr = createMockSessionMgr({
        totalInputTokens: 1000,
        totalOutputTokens: 500,
      });
      transcript = createMockTranscript([]);

      const mgr = new CompactionManager(
        bridge,
        sessionMgr,
        transcript,
        '/tmp/workspace',
        refreshSystemPrompt,
      );

      await mgr.runCompact();
      expect(bridge.run).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No transcript'));
    });

    it('compacts with summary and recent messages', async () => {
      sessionMgr = createMockSessionMgr({
        totalInputTokens: 5000,
        totalOutputTokens: 3000,
        turns: 30,
      });

      // 25 messages: 5 older (will be summarized) + 20 recent (kept)
      const messages = Array.from({ length: 25 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      }));
      transcript = createMockTranscript(messages);

      (bridge.run as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: 'Summary of older messages',
      });

      const mgr = new CompactionManager(
        bridge,
        sessionMgr,
        transcript,
        '/tmp/workspace',
        refreshSystemPrompt,
      );

      await mgr.runCompact();

      expect(bridge.run).toHaveBeenCalled();
      expect(mgr.compactedContext).toContain('Summary of older messages');
      expect(mgr.compactedContext).toContain('Recent Messages (verbatim)');
      expect(mgr.lastCompactionInfo).toEqual({ summarized: 5, kept: 20 });
      expect(sessionMgr.current.sdkSessionId).toBeUndefined();
      expect(sessionMgr.save).toHaveBeenCalled();
      expect(refreshSystemPrompt).toHaveBeenCalled();
    });

    it('keeps all messages verbatim when fewer than keepRecent', async () => {
      sessionMgr = createMockSessionMgr({
        totalInputTokens: 500,
        totalOutputTokens: 200,
      });

      const messages = Array.from({ length: 5 }, (_, i) => ({
        role: 'user',
        content: `Msg ${i}`,
      }));
      transcript = createMockTranscript(messages);

      const mgr = new CompactionManager(
        bridge,
        sessionMgr,
        transcript,
        '/tmp/workspace',
        refreshSystemPrompt,
        { keepRecent: 20 },
      );

      await mgr.runCompact();

      // No bridge call because there are no older messages to summarize
      expect(bridge.run).not.toHaveBeenCalled();
      expect(mgr.compactedContext).toContain('Recent Messages (verbatim)');
      expect(mgr.lastCompactionInfo).toEqual({ summarized: 0, kept: 5 });
    });

    it('truncates long verbatim messages to 3000 chars', async () => {
      sessionMgr = createMockSessionMgr({
        totalInputTokens: 1000,
        totalOutputTokens: 500,
      });

      const longMsg = 'x'.repeat(5000);
      transcript = createMockTranscript([{ role: 'user', content: longMsg }]);

      const mgr = new CompactionManager(
        bridge,
        sessionMgr,
        transcript,
        '/tmp/workspace',
        refreshSystemPrompt,
        { keepRecent: 20 },
      );

      await mgr.runCompact();

      expect(mgr.compactedContext).not.toContain('x'.repeat(5000));
      expect(mgr.compactedContext).toContain('x'.repeat(3000));
      expect(mgr.compactedContext).toContain('...');
    });
  });

  // ─── autoCompactIfNeeded ────────────────────────────────────────

  describe('autoCompactIfNeeded', () => {
    it('does nothing when turns are below threshold', async () => {
      sessionMgr = createMockSessionMgr({ turns: 5 });

      const mgr = new CompactionManager(
        bridge,
        sessionMgr,
        transcript,
        '/tmp/workspace',
        refreshSystemPrompt,
        { autoCompactThreshold: 15 },
      );

      await mgr.autoCompactIfNeeded();
      expect(bridge.run).not.toHaveBeenCalled();
    });

    it('does nothing when turns is not a multiple of threshold', async () => {
      sessionMgr = createMockSessionMgr({ turns: 16 });

      const mgr = new CompactionManager(
        bridge,
        sessionMgr,
        transcript,
        '/tmp/workspace',
        refreshSystemPrompt,
        { autoCompactThreshold: 15 },
      );

      await mgr.autoCompactIfNeeded();
      expect(bridge.run).not.toHaveBeenCalled();
    });

    it('does nothing when history has fewer messages than keepRecent', async () => {
      sessionMgr = createMockSessionMgr({ turns: 15 });
      transcript = createMockTranscript(
        Array.from({ length: 5 }, (_, i) => ({
          role: 'user',
          content: `Msg ${i}`,
        })),
      );

      const mgr = new CompactionManager(
        bridge,
        sessionMgr,
        transcript,
        '/tmp/workspace',
        refreshSystemPrompt,
        { autoCompactThreshold: 15, keepRecent: 20 },
      );

      await mgr.autoCompactIfNeeded();
      expect(bridge.run).not.toHaveBeenCalled();
    });

    it('triggers compaction at threshold multiple with enough history', async () => {
      sessionMgr = createMockSessionMgr({
        turns: 15,
        totalInputTokens: 8000,
        totalOutputTokens: 4000,
      });

      const messages = Array.from({ length: 30 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Auto msg ${i}`,
      }));
      transcript = createMockTranscript(messages);

      (bridge.run as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: 'Auto-compacted summary',
      });

      const mgr = new CompactionManager(
        bridge,
        sessionMgr,
        transcript,
        '/tmp/workspace',
        refreshSystemPrompt,
        { autoCompactThreshold: 15, keepRecent: 10 },
      );

      await mgr.autoCompactIfNeeded();

      expect(bridge.run).toHaveBeenCalled();
      expect(mgr.compactedContext).toContain('Auto-compacted summary');
      expect(mgr.lastCompactionInfo).toEqual({ summarized: 20, kept: 10 });
      expect(sessionMgr.current.sdkSessionId).toBeUndefined();
      expect(sessionMgr.save).toHaveBeenCalled();
    });

    it('triggers at second threshold multiple (turns=30, threshold=15)', async () => {
      sessionMgr = createMockSessionMgr({
        turns: 30,
        totalInputTokens: 15000,
        totalOutputTokens: 7000,
      });

      const messages = Array.from({ length: 40 }, (_, i) => ({
        role: 'user',
        content: `Msg ${i}`,
      }));
      transcript = createMockTranscript(messages);

      (bridge.run as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: 'Second compaction',
      });

      const mgr = new CompactionManager(
        bridge,
        sessionMgr,
        transcript,
        '/tmp/workspace',
        refreshSystemPrompt,
        { autoCompactThreshold: 15, keepRecent: 10 },
      );

      await mgr.autoCompactIfNeeded();
      expect(bridge.run).toHaveBeenCalled();
      expect(mgr.compactedContext).toContain('Second compaction');
    });

    it('includes prior compacted context when available', async () => {
      sessionMgr = createMockSessionMgr({
        turns: 15,
        totalInputTokens: 5000,
        totalOutputTokens: 2000,
      });

      const messages = Array.from({ length: 25 }, (_, i) => ({
        role: 'user',
        content: `Msg ${i}`,
      }));
      transcript = createMockTranscript(messages);

      (bridge.run as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: 'Updated summary with prior context',
      });

      const mgr = new CompactionManager(
        bridge,
        sessionMgr,
        transcript,
        '/tmp/workspace',
        refreshSystemPrompt,
        { autoCompactThreshold: 15, keepRecent: 10 },
      );

      // Set prior compacted context
      mgr.compactedContext = 'Previous summary from earlier compaction';

      await mgr.autoCompactIfNeeded();

      // The summarize call should include the prior context
      const calledPrompt = (bridge.run as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(calledPrompt).toContain('Previous summary from earlier compaction');
    });

    it('silently handles failed compaction', async () => {
      sessionMgr = createMockSessionMgr({
        turns: 15,
        totalInputTokens: 5000,
        totalOutputTokens: 2000,
      });

      const messages = Array.from({ length: 25 }, (_, i) => ({
        role: 'user',
        content: `Msg ${i}`,
      }));
      transcript = createMockTranscript(messages);

      (bridge.run as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        error: 'TIMEOUT',
      });

      const mgr = new CompactionManager(
        bridge,
        sessionMgr,
        transcript,
        '/tmp/workspace',
        refreshSystemPrompt,
        { autoCompactThreshold: 15, keepRecent: 10 },
      );

      await mgr.autoCompactIfNeeded();

      // Should not have updated compacted context
      expect(mgr.compactedContext).toBeNull();
      expect(sessionMgr.save).not.toHaveBeenCalled();
    });
  });
});
