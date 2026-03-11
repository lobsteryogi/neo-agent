/**
 * ░▒▓ TAILSCALE MANAGER ▓▒░
 *
 * "Free your mind."
 *
 * Network connectivity health check via Tailscale.
 * Reports whether the machine is reachable on the Tailscale network.
 */

import type { ToolHealth } from '@neo-agent/shared';
import { execSync } from 'child_process';

export class TailscaleManager {
  name = 'tailscale';

  healthCheck(): ToolHealth {
    try {
      const raw = execSync('tailscale status --json', {
        encoding: 'utf-8',
        timeout: 5_000,
        stdio: 'pipe',
      });
      let status: any;
      try {
        status = JSON.parse(raw);
      } catch {
        return { available: false, degraded: 'Tailscale returned invalid JSON' };
      }
      const online = status?.Self?.Online ?? false;

      return online ? { available: true } : { available: false, degraded: 'Tailscale offline' };
    } catch {
      return { available: false, degraded: 'Tailscale not installed or not running' };
    }
  }
}
