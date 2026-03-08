import { describe, expect, it, vi } from 'vitest';
import { ClaudeBridge } from '../../src/core/claude-bridge';

// Mock the SDK
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

describe('ClaudeBridge', () => {
  it('returns TIMEOUT error when AbortController fires', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');

    // Mock to hang — never yields, so ClaudeBridge timeout (50ms) fires
    vi.mocked(query).mockImplementation((() => {
      const generator = (async function* () {
        // Hang forever
        await new Promise(() => {});
      })();
      return generator;
    }) as any);

    const bridge = new ClaudeBridge();
    const result = await bridge.run('test', { cwd: '/tmp', timeoutMs: 100 });
    expect(result.success).toBe(false);
    expect(result.error).toBe('TIMEOUT');
  }, 10_000);

  it('returns CRASH error on unexpected exception', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');

    vi.mocked(query).mockImplementation(() => {
      const generator = (async function* () {
        throw new Error('segfault');
      })();
      return generator as any;
    });

    const bridge = new ClaudeBridge();
    const result = await bridge.run('test', { cwd: '/tmp' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('CRASH');
  });

  it('emits stream events while iterating', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');

    vi.mocked(query).mockImplementation(() => {
      const generator = (async function* () {
        yield { type: 'assistant', message: { content: [{ type: 'text', text: 'hello' }] } };
      })();
      return generator as any;
    });

    const bridge = new ClaudeBridge();
    const events: any[] = [];
    bridge.on('stream', (e) => events.push(e));
    await bridge.run('test', { cwd: '/tmp' });
    expect(events).toHaveLength(1);
  });

  it('captures result text from assistant messages', async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');

    vi.mocked(query).mockImplementation(() => {
      const generator = (async function* () {
        yield {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'The answer is 4' }] },
        };
      })();
      return generator as any;
    });

    const bridge = new ClaudeBridge();
    const result = await bridge.run('test', { cwd: '/tmp' });
    expect(result.success).toBe(true);
    expect((result.data as any).content).toContain('4');
  });
});
