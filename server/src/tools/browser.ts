/**
 * ░▒▓ AGENT BROWSER TOOL ▓▒░
 *
 * "The Eyes."
 *
 * "I can only show you the door. You're the one that has to walk through it."
 *
 * Wraps the `agent-browser` CLI — health checks via `which agent-browser`.
 */

import type { ToolHealth } from '@neo-agent/shared';
import { execSync } from 'child_process';
import type { ToolIntegration } from './registry.js';

export class BrowserTool implements ToolIntegration {
  name = 'agent-browser';

  async healthCheck(): Promise<ToolHealth> {
    try {
      execSync('command -v agent-browser', { encoding: 'utf-8', stdio: 'pipe' });
      return { available: true };
    } catch {
      return { available: false, degraded: 'agent-browser CLI not installed' };
    }
  }

  fallback(): string {
    return 'Browser tool unavailable — install agent-browser CLI for web browsing capabilities.';
  }
}
