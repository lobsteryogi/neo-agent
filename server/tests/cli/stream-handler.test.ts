import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { attachStreamHandler, createStreamContext } from '../../src/cli/lib/stream-handler';
import type { ClaudeBridge } from '../../src/core/claude-bridge';

// Mock terminal utilities
vi.mock('../../src/utils/terminal.js', () => ({
  color: new Proxy(
    {},
    {
      get: () => (s: string) => s,
    },
  ),
}));

describe('createStreamContext', () => {
  it('returns a fresh context with correct defaults', () => {
    const ctx = createStreamContext();
    expect(ctx.firstToken).toBe(false);
    expect(ctx.toolActive).toBe(false);
    expect(ctx.fullResponse).toBe('');
    expect(ctx.totalInputTokens).toBe(0);
    expect(ctx.totalOutputTokens).toBe(0);
    expect(ctx.costUsd).toBe(0);
    expect(ctx.modelUsed).toBeUndefined();
    expect(ctx.sdkSessionId).toBeUndefined();
  });

  it('each call returns an independent context', () => {
    const ctx1 = createStreamContext();
    const ctx2 = createStreamContext();
    ctx1.fullResponse = 'hello';
    expect(ctx2.fullResponse).toBe('');
  });
});

describe('attachStreamHandler', () => {
  let bridge: EventEmitter & { run: any };
  let ctx: ReturnType<typeof createStreamContext>;
  let spinner: ReturnType<typeof setInterval>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    bridge = Object.assign(new EventEmitter(), { run: vi.fn() });
    ctx = createStreamContext();
    spinner = setInterval(() => {}, 100_000); // long interval, will be cleared
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    clearInterval(spinner);
    vi.restoreAllMocks();
  });

  // ─── Text streaming ──────────────────────────────────────────────

  it('writes text blocks to stdout on first token', () => {
    attachStreamHandler(bridge as any, ctx, spinner);

    bridge.emit('stream', {
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'Hello world' }],
      },
    });

    expect(ctx.firstToken).toBe(true);
    expect(ctx.fullResponse).toBe('Hello world');
    // Should have written the agent prefix + the text
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('accumulates text across multiple events', () => {
    attachStreamHandler(bridge as any, ctx, spinner);

    bridge.emit('stream', {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Part 1 ' }] },
    });

    bridge.emit('stream', {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Part 2' }] },
    });

    expect(ctx.fullResponse).toBe('Part 1 Part 2');
  });

  it('clears spinner on first token', () => {
    const clearSpy = vi.spyOn(global, 'clearInterval');
    attachStreamHandler(bridge as any, ctx, spinner);

    bridge.emit('stream', {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'First' }] },
    });

    expect(clearSpy).toHaveBeenCalledWith(spinner);
  });

  it('does not clear spinner on subsequent text tokens', () => {
    const clearSpy = vi.spyOn(global, 'clearInterval');
    attachStreamHandler(bridge as any, ctx, spinner);

    // First token clears spinner
    bridge.emit('stream', {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'First' }] },
    });

    clearSpy.mockClear();

    // Second token should not clear again
    bridge.emit('stream', {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Second' }] },
    });

    expect(clearSpy).not.toHaveBeenCalled();
  });

  // ─── Model capture ────────────────────────────────────────────────

  it('captures model from assistant message', () => {
    attachStreamHandler(bridge as any, ctx, spinner);

    bridge.emit('stream', {
      type: 'assistant',
      message: {
        model: 'claude-sonnet-4-20250514',
        content: [{ type: 'text', text: 'hi' }],
      },
    });

    expect(ctx.modelUsed).toBe('claude-sonnet-4-20250514');
  });

  // ─── Tool use ──────────────────────────────────────────────────────

  it('handles tool_use blocks', () => {
    attachStreamHandler(bridge as any, ctx, spinner);

    bridge.emit('stream', {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'Read',
            input: { file_path: '/src/main.ts' },
          },
        ],
      },
    });

    expect(ctx.firstToken).toBe(true);
    expect(ctx.toolActive).toBe(true);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Read'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('/src/main.ts'));
  });

  it('shows command for Bash tool_use', () => {
    attachStreamHandler(bridge as any, ctx, spinner);

    bridge.emit('stream', {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'Bash',
            input: { command: 'npm install' },
          },
        ],
      },
    });

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Bash'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('npm install'));
  });

  it('recovers from tool to text with fresh prefix', () => {
    attachStreamHandler(bridge as any, ctx, spinner);

    // First: text
    bridge.emit('stream', {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Before' }] },
    });

    // Tool use
    bridge.emit('stream', {
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/x' } }],
      },
    });

    expect(ctx.toolActive).toBe(true);

    // Text after tool
    stdoutSpy.mockClear();
    bridge.emit('stream', {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'After' }] },
    });

    expect(ctx.toolActive).toBe(false);
    expect(ctx.fullResponse).toBe('BeforeAfter');
    // Should have written the agent prefix again (contains the agent name)
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('neo'));
  });

  // ─── Tool progress ─────────────────────────────────────────────────

  it('handles tool_progress events', () => {
    attachStreamHandler(bridge as any, ctx, spinner);

    bridge.emit('stream', {
      type: 'tool_progress',
      tool_name: 'Bash',
      elapsed_time_seconds: 2.5,
    });

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Bash'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('2.5s'));
  });

  it('handles tool_progress with missing elapsed_time', () => {
    attachStreamHandler(bridge as any, ctx, spinner);

    bridge.emit('stream', {
      type: 'tool_progress',
      tool_name: 'Bash',
    });

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('?'));
  });

  // ─── Tool use summary ──────────────────────────────────────────────

  it('handles tool_use_summary events', () => {
    attachStreamHandler(bridge as any, ctx, spinner);

    bridge.emit('stream', {
      type: 'tool_use_summary',
      summary: 'File written successfully to /tmp/out.txt',
    });

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('File written successfully'));
  });

  it('truncates long tool_use_summary to 80 chars', () => {
    attachStreamHandler(bridge as any, ctx, spinner);

    const longSummary = 'A'.repeat(200);
    bridge.emit('stream', {
      type: 'tool_use_summary',
      summary: longSummary,
    });

    // The summary.slice(0, 80) should be applied
    const writtenContent = stdoutSpy.mock.calls.map((call) => call[0]).join('');
    expect(writtenContent).not.toContain('A'.repeat(200));
    expect(writtenContent).toContain('A'.repeat(80));
  });

  // ─── Session ID capture ─────────────────────────────────────────────

  it('captures session_id from stream events', () => {
    attachStreamHandler(bridge as any, ctx, spinner);

    bridge.emit('stream', {
      type: 'assistant',
      session_id: 'sess-abc-123',
      message: { content: [] },
    });

    expect(ctx.sdkSessionId).toBe('sess-abc-123');
  });

  it('only captures first session_id', () => {
    attachStreamHandler(bridge as any, ctx, spinner);

    bridge.emit('stream', {
      type: 'assistant',
      session_id: 'first-id',
      message: { content: [] },
    });

    bridge.emit('stream', {
      type: 'assistant',
      session_id: 'second-id',
      message: { content: [] },
    });

    expect(ctx.sdkSessionId).toBe('first-id');
  });

  // ─── Token + Cost capture ───────────────────────────────────────────

  it('captures tokens and cost from result event', () => {
    attachStreamHandler(bridge as any, ctx, spinner);

    bridge.emit('stream', {
      type: 'result',
      modelUsage: {
        'claude-sonnet-4-20250514': {
          inputTokens: 1000,
          outputTokens: 500,
          costUSD: 0.05,
        },
      },
    });

    expect(ctx.totalInputTokens).toBe(1000);
    expect(ctx.totalOutputTokens).toBe(500);
    expect(ctx.costUsd).toBe(0.05);
  });

  it('accumulates tokens across multiple model entries', () => {
    attachStreamHandler(bridge as any, ctx, spinner);

    bridge.emit('stream', {
      type: 'result',
      modelUsage: {
        'claude-sonnet-4-20250514': {
          inputTokens: 1000,
          outputTokens: 500,
          costUSD: 0.03,
        },
        'claude-haiku-3-20240307': {
          inputTokens: 200,
          outputTokens: 100,
          costUSD: 0.001,
        },
      },
    });

    expect(ctx.totalInputTokens).toBe(1200);
    expect(ctx.totalOutputTokens).toBe(600);
    expect(ctx.costUsd).toBeCloseTo(0.031);
  });

  it('handles snake_case token keys (input_tokens, output_tokens)', () => {
    attachStreamHandler(bridge as any, ctx, spinner);

    bridge.emit('stream', {
      type: 'result',
      modelUsage: {
        model: {
          input_tokens: 800,
          output_tokens: 300,
          costUSD: 0.02,
        },
      },
    });

    expect(ctx.totalInputTokens).toBe(800);
    expect(ctx.totalOutputTokens).toBe(300);
    expect(ctx.costUsd).toBe(0.02);
  });

  it('defaults missing token values to 0', () => {
    attachStreamHandler(bridge as any, ctx, spinner);

    bridge.emit('stream', {
      type: 'result',
      modelUsage: {
        model: {},
      },
    });

    expect(ctx.totalInputTokens).toBe(0);
    expect(ctx.totalOutputTokens).toBe(0);
    expect(ctx.costUsd).toBe(0);
  });

  // ─── Agent name customization ─────────────────────────────────────

  it('uses custom agent name in prefix', () => {
    attachStreamHandler(bridge as any, ctx, spinner, 'morpheus');

    bridge.emit('stream', {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Hello' }] },
    });

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('morpheus'));
  });

  it('defaults agent name to neo', () => {
    attachStreamHandler(bridge as any, ctx, spinner);

    bridge.emit('stream', {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Hello' }] },
    });

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('neo'));
  });

  // ─── Ignored events ───────────────────────────────────────────────

  it('ignores unknown event types without crashing', () => {
    attachStreamHandler(bridge as any, ctx, spinner);

    // Should not throw
    bridge.emit('stream', {
      type: 'unknown_type',
      data: 'something',
    });

    expect(ctx.fullResponse).toBe('');
  });

  it('handles assistant events with non-array content gracefully', () => {
    attachStreamHandler(bridge as any, ctx, spinner);

    bridge.emit('stream', {
      type: 'assistant',
      message: { content: 'not an array' },
    });

    // Should not crash, should not accumulate
    expect(ctx.fullResponse).toBe('');
  });
});
