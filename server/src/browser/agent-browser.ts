/**
 * ░▒▓ AGENT BROWSER — Core Wrapper ▓▒░
 *
 * "I know kung fu."
 *
 * TypeScript wrapper over the `agent-browser` CLI for browser automation.
 * Manages daemon lifecycle and provides a typed interface for common actions.
 *
 * Design: agent-browser is a CLI tool with a background daemon.
 * We spawn CLI commands via child_process for reliability.
 * The daemon auto-starts on first command and stays alive for the session.
 */

import { getErrorMessage } from '../utils/errors.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);
const log = logger('browser');

const DEFAULT_TIMEOUT = 30_000;
const MAX_OUTPUT = 100_000; // cap output to prevent memory bloat

export interface BrowserExecResult {
  success: boolean;
  output: string;
  error?: string;
  durationMs: number;
}

export interface BrowserConfig {
  /** Max timeout per command in ms (default: 30000) */
  timeoutMs?: number;
  /** Run browser headed (visible) — useful for debugging */
  headed?: boolean;
  /** Proxy URL for browser traffic */
  proxy?: string;
  /** Allowed domains (comma-separated) for security */
  allowedDomains?: string;
  /** Session name for state persistence */
  sessionName?: string;
  /** Custom executable path for the browser binary */
  executablePath?: string;
}

/**
 * Wraps the agent-browser CLI.
 * Each method maps to a CLI subcommand and returns structured results.
 */
export class AgentBrowser {
  private config: BrowserConfig;
  private env: Record<string, string>;

  constructor(config: BrowserConfig = {}) {
    this.config = config;
    this.env = this.buildEnv();
  }

  private buildEnv(): Record<string, string> {
    const env: Record<string, string> = { ...process.env } as Record<string, string>;

    if (this.config.headed) env.AGENT_BROWSER_HEADED = '1';
    if (this.config.proxy) env.AGENT_BROWSER_PROXY = this.config.proxy;
    if (this.config.allowedDomains) env.AGENT_BROWSER_ALLOWED_DOMAINS = this.config.allowedDomains;
    if (this.config.sessionName) env.AGENT_BROWSER_SESSION_NAME = this.config.sessionName;
    if (this.config.executablePath) env.AGENT_BROWSER_EXECUTABLE_PATH = this.config.executablePath;

    // Security defaults
    env.AGENT_BROWSER_CONTENT_BOUNDARIES = '1';
    env.AGENT_BROWSER_MAX_OUTPUT = String(MAX_OUTPUT);

    return env;
  }

  /**
   * Execute a raw agent-browser CLI command.
   */
  async exec(args: string[]): Promise<BrowserExecResult> {
    const timeout = this.config.timeoutMs ?? DEFAULT_TIMEOUT;
    const start = Date.now();

    log.debug('Browser exec', { args: args.join(' '), timeout });

    try {
      const { stdout, stderr } = await execFileAsync('npx', ['agent-browser', ...args], {
        timeout,
        env: this.env,
        maxBuffer: MAX_OUTPUT * 2,
      });

      const durationMs = Date.now() - start;
      const output = (stdout || '').slice(0, MAX_OUTPUT);

      if (stderr && stderr.trim()) {
        log.debug('Browser stderr', { stderr: stderr.slice(0, 500) });
      }

      log.debug('Browser exec done', { durationMs, outputLength: output.length });

      return { success: true, output, durationMs };
    } catch (err: unknown) {
      const durationMs = Date.now() - start;
      const errMsg = getErrorMessage(err);
      const stderr = (err as any)?.stderr || '';
      const stdout = (err as any)?.stdout || '';

      log.error('Browser exec failed', { args: args.join(' '), durationMs, error: errMsg });

      return {
        success: false,
        output: stdout.slice(0, MAX_OUTPUT),
        error: stderr || errMsg,
        durationMs,
      };
    }
  }

  // ─── High-Level Actions ─────────────────────────────────────

  /** Navigate to a URL */
  async open(url: string): Promise<BrowserExecResult> {
    return this.exec(['open', url]);
  }

  /** Get accessibility tree snapshot (interactive elements only) */
  async snapshot(interactive = true): Promise<BrowserExecResult> {
    const args = ['snapshot'];
    if (interactive) args.push('-i');
    return this.exec(args);
  }

  /** Click an element by ref (e.g. "@e1") or selector */
  async click(target: string): Promise<BrowserExecResult> {
    return this.exec(['click', target]);
  }

  /** Fill a form field by ref with text */
  async fill(target: string, text: string): Promise<BrowserExecResult> {
    return this.exec(['fill', target, text]);
  }

  /** Type text (keystroke simulation) */
  async type(text: string): Promise<BrowserExecResult> {
    return this.exec(['type', text]);
  }

  /** Press a key (Enter, Tab, Escape, etc.) */
  async press(key: string): Promise<BrowserExecResult> {
    return this.exec(['press', key]);
  }

  /** Take a screenshot (returns base64 or saves to file) */
  async screenshot(opts?: { full?: boolean; path?: string }): Promise<BrowserExecResult> {
    const args = ['screenshot'];
    if (opts?.full) args.push('--full');
    if (opts?.path) args.push('--output', opts.path);
    return this.exec(args);
  }

  /** Get page text content */
  async getText(selector?: string): Promise<BrowserExecResult> {
    const args = ['get', 'text'];
    if (selector) args.push(selector);
    return this.exec(args);
  }

  /** Get current page URL */
  async getUrl(): Promise<BrowserExecResult> {
    return this.exec(['get', 'url']);
  }

  /** Get current page title */
  async getTitle(): Promise<BrowserExecResult> {
    return this.exec(['get', 'title']);
  }

  /** Go back */
  async back(): Promise<BrowserExecResult> {
    return this.exec(['back']);
  }

  /** Go forward */
  async forward(): Promise<BrowserExecResult> {
    return this.exec(['forward']);
  }

  /** Reload the page */
  async reload(): Promise<BrowserExecResult> {
    return this.exec(['reload']);
  }

  /** Wait for a selector, navigation, or network idle */
  async wait(target: string, opts?: { timeout?: number }): Promise<BrowserExecResult> {
    const args = ['wait', target];
    if (opts?.timeout) args.push('--timeout', String(opts.timeout));
    return this.exec(args);
  }

  /** Select an option from a dropdown */
  async select(target: string, value: string): Promise<BrowserExecResult> {
    return this.exec(['select', target, value]);
  }

  /** Hover over an element */
  async hover(target: string): Promise<BrowserExecResult> {
    return this.exec(['hover', target]);
  }

  /** Scroll the page or an element */
  async scroll(direction: 'up' | 'down', amount?: number): Promise<BrowserExecResult> {
    const args = ['mouse', 'wheel'];
    const delta = direction === 'down' ? (amount ?? 500) : -(amount ?? 500);
    args.push('--deltaY', String(delta));
    return this.exec(args);
  }

  /** Manage tabs */
  async tab(action?: 'new' | 'close' | number): Promise<BrowserExecResult> {
    const args = ['tab'];
    if (action !== undefined) args.push(String(action));
    return this.exec(args);
  }

  /** Get console log output */
  async console(): Promise<BrowserExecResult> {
    return this.exec(['console']);
  }

  /** Get page errors */
  async errors(): Promise<BrowserExecResult> {
    return this.exec(['errors']);
  }

  /** Save authentication state */
  async authSave(name: string): Promise<BrowserExecResult> {
    return this.exec(['auth', 'save', name]);
  }

  /** Load authentication state */
  async authLogin(name: string): Promise<BrowserExecResult> {
    return this.exec(['auth', 'login', name]);
  }

  /** Install browser binaries (Chromium) */
  async install(): Promise<BrowserExecResult> {
    log.info('Installing browser binaries...');
    return this.exec(['install']);
  }

  /** Check if agent-browser is available and working */
  async healthCheck(): Promise<{ available: boolean; version?: string; error?: string }> {
    try {
      const result = await this.exec(['--version']);
      if (result.success) {
        return { available: true, version: result.output.trim() };
      }
      return { available: false, error: result.error };
    } catch (err) {
      return { available: false, error: String(err) };
    }
  }

  /** Close browser and stop daemon */
  async close(): Promise<BrowserExecResult> {
    return this.exec(['close']);
  }
}
