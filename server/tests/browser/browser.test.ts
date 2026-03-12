import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promisify } from 'util';

// We need to mock child_process.execFile such that promisify(execFile) works.
// Node's execFile has a custom [util.promisify.custom] symbol that returns {stdout, stderr}.
// Our mock must replicate this behavior.
const mockExecFile = vi.hoisted(() => {
  const fn = vi.fn() as any;
  // Add the custom promisify symbol so util.promisify returns {stdout, stderr}
  fn[Symbol.for('nodejs.util.promisify.custom')] = vi.fn();
  return fn;
});

const mockExecFileAsync = vi.hoisted(() => {
  // This is what promisify(execFile) will resolve to
  return mockExecFile[Symbol.for('nodejs.util.promisify.custom')] as ReturnType<typeof vi.fn>;
});

vi.mock('child_process', () => ({
  execFile: mockExecFile,
}));

// Also mock util.promisify to return our controlled async function
vi.mock('util', async (importOriginal) => {
  const original = (await importOriginal()) as any;
  return {
    ...original,
    promisify: (fn: any) => {
      if (fn === mockExecFile) {
        return mockExecFileAsync;
      }
      return original.promisify(fn);
    },
  };
});

import { AgentBrowser, type BrowserConfig } from '../../src/browser/agent-browser';

// Helper: make execFileAsync resolve with {stdout, stderr}
function mockSuccess(stdout: string, stderr = '') {
  mockExecFileAsync.mockResolvedValue({ stdout, stderr });
}

// Helper: make execFileAsync reject with an error
function mockError(msg: string, stdout = '', stderr = '') {
  const err: any = new Error(msg);
  err.stdout = stdout;
  err.stderr = stderr;
  mockExecFileAsync.mockRejectedValue(err);
}

describe('AgentBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Constructor and Config ─────────────────────────────────

  it('constructs with default config', () => {
    const browser = new AgentBrowser();
    expect(browser).toBeDefined();
  });

  it('constructs with custom config', () => {
    const config: BrowserConfig = {
      timeoutMs: 60_000,
      headed: true,
      proxy: 'http://proxy.example.com',
      allowedDomains: 'example.com,test.com',
      sessionName: 'my-session',
      executablePath: '/usr/bin/chromium',
    };
    const browser = new AgentBrowser(config);
    expect(browser).toBeDefined();
  });

  it('sets environment variables from config', () => {
    const browser = new AgentBrowser({
      headed: true,
      proxy: 'http://proxy.test',
      allowedDomains: 'test.com',
      sessionName: 'session-1',
      executablePath: '/usr/bin/chrome',
    });

    const env = (browser as any).env;
    expect(env.AGENT_BROWSER_HEADED).toBe('1');
    expect(env.AGENT_BROWSER_PROXY).toBe('http://proxy.test');
    expect(env.AGENT_BROWSER_ALLOWED_DOMAINS).toBe('test.com');
    expect(env.AGENT_BROWSER_SESSION_NAME).toBe('session-1');
    expect(env.AGENT_BROWSER_EXECUTABLE_PATH).toBe('/usr/bin/chrome');
    // Security defaults
    expect(env.AGENT_BROWSER_CONTENT_BOUNDARIES).toBe('1');
    expect(env.AGENT_BROWSER_MAX_OUTPUT).toBe('100000');
  });

  it('does not set env vars for undefined config values', () => {
    const browser = new AgentBrowser({});
    const env = (browser as any).env;
    expect(env.AGENT_BROWSER_HEADED).toBeUndefined();
    expect(env.AGENT_BROWSER_PROXY).toBeUndefined();
  });

  // ─── exec() ─────────────────────────────────────────────────

  it('exec() calls the promisified execFile with correct args', async () => {
    mockSuccess('page loaded');
    const browser = new AgentBrowser();

    const result = await browser.exec(['open', 'https://example.com']);

    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'open', 'https://example.com'],
      expect.objectContaining({ timeout: 30_000 }),
    );
    expect(result.success).toBe(true);
    expect(result.output).toBe('page loaded');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('exec() returns failure on error', async () => {
    mockError('Command failed', '', 'browser not found');
    const browser = new AgentBrowser();

    const result = await browser.exec(['open', 'bad-url']);

    expect(result.success).toBe(false);
    expect(result.error).toBe('browser not found');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('exec() uses error message when stderr is empty', async () => {
    mockError('npx not found');
    const browser = new AgentBrowser();

    const result = await browser.exec(['open', 'test']);

    expect(result.success).toBe(false);
    expect(result.error).toBe('npx not found');
  });

  it('exec() uses custom timeout from config', async () => {
    mockSuccess('ok');
    const browser = new AgentBrowser({ timeoutMs: 60_000 });

    await browser.exec(['snapshot']);

    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'snapshot'],
      expect.objectContaining({ timeout: 60_000 }),
    );
  });

  it('exec() truncates output to MAX_OUTPUT limit', async () => {
    const longOutput = 'X'.repeat(200_000);
    mockSuccess(longOutput);

    const browser = new AgentBrowser();
    const result = await browser.exec(['get', 'text']);

    expect(result.output.length).toBeLessThanOrEqual(100_000);
  });

  it('exec() returns stdout from errored commands', async () => {
    const err: any = new Error('exit code 1');
    err.stdout = 'partial output';
    err.stderr = 'some error';
    mockExecFileAsync.mockRejectedValue(err);

    const browser = new AgentBrowser();
    const result = await browser.exec(['test']);

    expect(result.success).toBe(false);
    expect(result.output).toBe('partial output');
    expect(result.error).toBe('some error');
  });

  // ─── High-Level Actions ─────────────────────────────────────

  it('open() calls exec with correct args', async () => {
    mockSuccess('navigated');
    const browser = new AgentBrowser();

    const result = await browser.open('https://example.com');
    expect(result.success).toBe(true);
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'open', 'https://example.com'],
      expect.any(Object),
    );
  });

  it('snapshot() adds -i flag for interactive mode (default)', async () => {
    mockSuccess('<snapshot>');
    const browser = new AgentBrowser();

    await browser.snapshot();
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'snapshot', '-i'],
      expect.any(Object),
    );
  });

  it('snapshot() omits -i flag when interactive is false', async () => {
    mockSuccess('<full-snapshot>');
    const browser = new AgentBrowser();

    await browser.snapshot(false);
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'snapshot'],
      expect.any(Object),
    );
  });

  it('click() calls exec with target ref', async () => {
    mockSuccess('clicked');
    const browser = new AgentBrowser();

    await browser.click('@e1');
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'click', '@e1'],
      expect.any(Object),
    );
  });

  it('fill() calls exec with target and text', async () => {
    mockSuccess('filled');
    const browser = new AgentBrowser();

    await browser.fill('@e2', 'search term');
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'fill', '@e2', 'search term'],
      expect.any(Object),
    );
  });

  it('type() calls exec with text', async () => {
    mockSuccess('typed');
    const browser = new AgentBrowser();

    await browser.type('hello world');
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'type', 'hello world'],
      expect.any(Object),
    );
  });

  it('press() calls exec with key name', async () => {
    mockSuccess('pressed');
    const browser = new AgentBrowser();

    await browser.press('Enter');
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'press', 'Enter'],
      expect.any(Object),
    );
  });

  it('screenshot() calls exec without flags by default', async () => {
    mockSuccess('screenshot data');
    const browser = new AgentBrowser();

    await browser.screenshot();
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'screenshot'],
      expect.any(Object),
    );
  });

  it('screenshot() adds --full flag when requested', async () => {
    mockSuccess('full screenshot');
    const browser = new AgentBrowser();

    await browser.screenshot({ full: true });
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'screenshot', '--full'],
      expect.any(Object),
    );
  });

  it('screenshot() adds --output flag with path', async () => {
    mockSuccess('saved');
    const browser = new AgentBrowser();

    await browser.screenshot({ path: '/tmp/shot.png' });
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'screenshot', '--output', '/tmp/shot.png'],
      expect.any(Object),
    );
  });

  it('getText() calls exec for text retrieval', async () => {
    mockSuccess('page text');
    const browser = new AgentBrowser();

    const result = await browser.getText();
    expect(result.output).toBe('page text');
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'get', 'text'],
      expect.any(Object),
    );
  });

  it('getText() includes selector when provided', async () => {
    mockSuccess('element text');
    const browser = new AgentBrowser();

    await browser.getText('.main-content');
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'get', 'text', '.main-content'],
      expect.any(Object),
    );
  });

  it('getUrl() retrieves current URL', async () => {
    mockSuccess('https://example.com/page');
    const browser = new AgentBrowser();

    const result = await browser.getUrl();
    expect(result.output).toBe('https://example.com/page');
  });

  it('getTitle() retrieves page title', async () => {
    mockSuccess('Example Page');
    const browser = new AgentBrowser();

    const result = await browser.getTitle();
    expect(result.output).toBe('Example Page');
  });

  it('back() navigates back', async () => {
    mockSuccess('navigated back');
    const browser = new AgentBrowser();

    await browser.back();
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'back'],
      expect.any(Object),
    );
  });

  it('forward() navigates forward', async () => {
    mockSuccess('navigated forward');
    const browser = new AgentBrowser();

    await browser.forward();
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'forward'],
      expect.any(Object),
    );
  });

  it('reload() reloads the page', async () => {
    mockSuccess('reloaded');
    const browser = new AgentBrowser();

    await browser.reload();
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'reload'],
      expect.any(Object),
    );
  });

  it('wait() waits for a selector', async () => {
    mockSuccess('element found');
    const browser = new AgentBrowser();

    await browser.wait('.loading');
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'wait', '.loading'],
      expect.any(Object),
    );
  });

  it('wait() includes timeout option', async () => {
    mockSuccess('element found');
    const browser = new AgentBrowser();

    await browser.wait('.spinner', { timeout: 5000 });
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'wait', '.spinner', '--timeout', '5000'],
      expect.any(Object),
    );
  });

  it('select() selects a dropdown option', async () => {
    mockSuccess('selected');
    const browser = new AgentBrowser();

    await browser.select('@e3', 'Option A');
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'select', '@e3', 'Option A'],
      expect.any(Object),
    );
  });

  it('hover() hovers over an element', async () => {
    mockSuccess('hovered');
    const browser = new AgentBrowser();

    await browser.hover('@e4');
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'hover', '@e4'],
      expect.any(Object),
    );
  });

  it('scroll() scrolls down by default amount', async () => {
    mockSuccess('scrolled');
    const browser = new AgentBrowser();

    await browser.scroll('down');
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'mouse', 'wheel', '--deltaY', '500'],
      expect.any(Object),
    );
  });

  it('scroll() scrolls up with negative delta', async () => {
    mockSuccess('scrolled');
    const browser = new AgentBrowser();

    await browser.scroll('up');
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'mouse', 'wheel', '--deltaY', '-500'],
      expect.any(Object),
    );
  });

  it('scroll() uses custom amount', async () => {
    mockSuccess('scrolled');
    const browser = new AgentBrowser();

    await browser.scroll('down', 1000);
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'mouse', 'wheel', '--deltaY', '1000'],
      expect.any(Object),
    );
  });

  it('tab() lists tabs when no action given', async () => {
    mockSuccess('Tab 1: example.com');
    const browser = new AgentBrowser();

    await browser.tab();
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'tab'],
      expect.any(Object),
    );
  });

  it('tab() opens new tab', async () => {
    mockSuccess('new tab opened');
    const browser = new AgentBrowser();

    await browser.tab('new');
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'tab', 'new'],
      expect.any(Object),
    );
  });

  it('tab() switches to tab by number', async () => {
    mockSuccess('switched');
    const browser = new AgentBrowser();

    await browser.tab(2);
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'tab', '2'],
      expect.any(Object),
    );
  });

  it('tab() closes current tab', async () => {
    mockSuccess('closed');
    const browser = new AgentBrowser();

    await browser.tab('close');
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'tab', 'close'],
      expect.any(Object),
    );
  });

  it('console() retrieves console log output', async () => {
    mockSuccess('[LOG] Hello');
    const browser = new AgentBrowser();

    const result = await browser.console();
    expect(result.output).toBe('[LOG] Hello');
  });

  it('errors() retrieves page errors', async () => {
    mockSuccess('TypeError: undefined is not a function');
    const browser = new AgentBrowser();

    const result = await browser.errors();
    expect(result.output).toContain('TypeError');
  });

  it('authSave() saves authentication state', async () => {
    mockSuccess('saved');
    const browser = new AgentBrowser();

    await browser.authSave('github');
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'auth', 'save', 'github'],
      expect.any(Object),
    );
  });

  it('authLogin() loads authentication state', async () => {
    mockSuccess('loaded');
    const browser = new AgentBrowser();

    await browser.authLogin('github');
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'auth', 'login', 'github'],
      expect.any(Object),
    );
  });

  it('close() stops the browser daemon', async () => {
    mockSuccess('closed');
    const browser = new AgentBrowser();

    await browser.close();
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'close'],
      expect.any(Object),
    );
  });

  // ─── healthCheck() ─────────────────────────────────────────

  it('healthCheck() returns available=true when version succeeds', async () => {
    mockSuccess('1.2.3\n');
    const browser = new AgentBrowser();

    const health = await browser.healthCheck();
    expect(health.available).toBe(true);
    expect(health.version).toBe('1.2.3');
  });

  it('healthCheck() returns available=false when version fails', async () => {
    mockError('not found', '', 'npx: agent-browser not found');
    const browser = new AgentBrowser();

    const health = await browser.healthCheck();
    expect(health.available).toBe(false);
    expect(health.error).toBeDefined();
  });

  it('install() calls exec with install subcommand', async () => {
    mockSuccess('Chromium installed');
    const browser = new AgentBrowser();

    await browser.install();
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'npx',
      ['agent-browser', 'install'],
      expect.any(Object),
    );
  });
});
