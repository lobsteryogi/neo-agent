/**
 * ░▒▓ AGENT BROWSER TOOL ▓▒░
 *
 * "The Eyes."
 *
 * "I can only show you the door. You're the one that has to walk through it."
 *
 * Wraps the `agent-browser` CLI — health checks, version detection, and
 * auto-install of browser binaries.
 */

import type { ToolHealth } from '@neo-agent/shared';
import { getErrorMessage } from '../utils/errors.js';
import { execSync } from 'child_process';
import { AgentBrowser } from '../browser/agent-browser.js';
import { logger } from '../utils/logger.js';
import type { ToolIntegration } from './registry.js';

const log = logger('tool:browser');

export class BrowserTool implements ToolIntegration {
  name = 'agent-browser';
  required = false;

  private instance: AgentBrowser | null = null;

  /** Get or create the shared AgentBrowser instance */
  getBrowser(): AgentBrowser {
    if (!this.instance) {
      this.instance = new AgentBrowser({
        timeoutMs: 30_000,
        headed: process.env.AGENT_BROWSER_HEADED === '1',
        proxy: process.env.AGENT_BROWSER_PROXY,
        allowedDomains: process.env.AGENT_BROWSER_ALLOWED_DOMAINS,
        sessionName: process.env.AGENT_BROWSER_SESSION_NAME ?? 'neo',
      });
    }
    return this.instance;
  }

  async healthCheck(): Promise<ToolHealth> {
    try {
      // Check CLI availability
      execSync('npx agent-browser --version', {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 15_000,
      });

      log.debug('agent-browser health: available');
      return { available: true };
    } catch (err) {
      const msg = getErrorMessage(err);
      log.debug('agent-browser health: unavailable', { error: msg });
      return {
        available: false,
        degraded: 'agent-browser CLI not available — run `npx agent-browser install` to set up',
      };
    }
  }

  /** Install Chromium browser binaries */
  async installBinaries(): Promise<boolean> {
    try {
      log.info('Installing agent-browser Chromium binaries...');
      const browser = this.getBrowser();
      const result = await browser.install();
      if (result.success) {
        log.info('Browser binaries installed successfully');
        return true;
      }
      log.error('Browser binary install failed', { error: result.error });
      return false;
    } catch (err) {
      log.error('Browser binary install error', { error: String(err) });
      return false;
    }
  }

  fallback(): string {
    return 'Browser tool unavailable — run `npx agent-browser install` to set up browser automation.';
  }
}
