/**
 * ░▒▓ TAILSCALE TOOL ▓▒░
 *
 * "The phone is your way out."
 *
 * Wraps the `tailscale` CLI — status checks, peer discovery,
 * connectivity probes, and remote exec via tailscale ssh.
 */

import type { ToolHealth } from '@neo-agent/shared';
import { execSync, execFileSync } from 'child_process';
import { getErrorMessage } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { ToolIntegration } from './registry.js';

const log = logger('tool:tailscale');

// ─── Types ─────────────────────────────────────────────────────

export interface TailscaleSelf {
  hostname: string;
  ip: string; // IPv4 address on tailnet
  ip6?: string; // IPv6 address on tailnet
  tailnet: string;
  online: boolean;
}

export interface TailscalePeer {
  hostname: string;
  ip: string;
  ip6?: string;
  online: boolean;
  os?: string;
  tags?: string[];
}

export interface TailscaleStatus {
  self: TailscaleSelf;
  peers: TailscalePeer[];
  connected: boolean;
}

// ─── TailscaleTool ─────────────────────────────────────────────

export class TailscaleTool implements ToolIntegration {
  name = 'tailscale';
  required = false;

  // ─── Health Check ─────────────────────────────────────────────

  async healthCheck(): Promise<ToolHealth> {
    try {
      const raw = execSync('tailscale status --json', {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 10_000,
      });

      const data = JSON.parse(raw);

      if (!data.BackendState || data.BackendState === 'Stopped') {
        log.debug('tailscale health: installed but not running');
        return {
          available: false,
          degraded: 'Tailscale installed but not running — run `tailscale up` to connect',
        };
      }

      if (data.BackendState !== 'Running') {
        log.debug('tailscale health: degraded', { state: data.BackendState });
        return {
          available: true,
          degraded: `Tailscale state: ${data.BackendState}`,
        };
      }

      log.debug('tailscale health: connected', { tailnet: data.CurrentTailnet?.Name });
      return { available: true };
    } catch (err) {
      const msg = getErrorMessage(err);
      if (msg.includes('not found') || msg.includes('command not found')) {
        log.debug('tailscale health: not installed');
        return {
          available: false,
          degraded: 'Tailscale not installed — see https://tailscale.com/download',
        };
      }
      log.debug('tailscale health check failed', { error: msg });
      return { available: false, degraded: `Tailscale check failed: ${msg}` };
    }
  }

  // ─── status() ─────────────────────────────────────────────────

  /** Get tailnet status: self identity + all peers. */
  async status(): Promise<TailscaleStatus> {
    const raw = execSync('tailscale status --json', {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 10_000,
    });

    const data = JSON.parse(raw);
    const connected: boolean = data.BackendState === 'Running';

    // Self
    const selfNode = data.Self ?? {};
    const selfAddrs: string[] = selfNode.TailscaleIPs ?? [];
    const self: TailscaleSelf = {
      hostname: selfNode.HostName ?? selfNode.DNSName?.split('.')[0] ?? 'unknown',
      ip: selfAddrs.find((a: string) => !a.includes(':')) ?? selfAddrs[0] ?? '',
      ip6: selfAddrs.find((a: string) => a.includes(':')),
      tailnet: data.CurrentTailnet?.Name ?? '',
      online: connected,
    };

    // Peers
    const peerMap: Record<string, unknown> = data.Peer ?? {};
    const peers: TailscalePeer[] = Object.values(peerMap).map((p: any) => {
      const addrs: string[] = p.TailscaleIPs ?? [];
      return {
        hostname: p.HostName ?? p.DNSName?.split('.')[0] ?? 'unknown',
        ip: addrs.find((a: string) => !a.includes(':')) ?? addrs[0] ?? '',
        ip6: addrs.find((a: string) => a.includes(':')),
        online: p.Online ?? false,
        os: p.OS,
        tags: p.Tags,
      };
    });

    return { self, peers, connected };
  }

  // ─── peers() ─────────────────────────────────────────────────

  /** List all reachable peers on the tailnet. */
  async peers(): Promise<TailscalePeer[]> {
    const { peers } = await this.status();
    return peers;
  }

  // ─── ping() ──────────────────────────────────────────────────

  /** Ping a peer by hostname or IP. Returns latency string or throws on failure. */
  async ping(host: string): Promise<string> {
    const result = execSync(`tailscale ping --c 1 ${host}`, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 15_000,
    });
    return result.trim();
  }

  // ─── ssh() ───────────────────────────────────────────────────

  /**
   * Run a command on a remote tailnet node via tailscale ssh.
   * Returns stdout of the remote command.
   */
  ssh(host: string, command: string): string {
    log.debug('tailscale ssh', { host, command });
    // Use execFileSync to avoid shell injection
    const result = execFileSync('tailscale', ['ssh', host, '--', 'sh', '-c', command], {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 30_000,
    });
    return result;
  }

  // ─── whoami() ────────────────────────────────────────────────

  /** Return the node's tailscale identity (self). */
  async whoami(): Promise<TailscaleSelf> {
    const { self } = await this.status();
    return self;
  }

  fallback(): string {
    return 'Tailscale tool unavailable — install from https://tailscale.com/download and run `tailscale up`.';
  }
}
