import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock child_process before importing the module
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'child_process';
import { TailscaleManager } from '../../src/sync/tailscale';

describe('TailscaleManager', () => {
  let manager: TailscaleManager;
  const mockExecSync = vi.mocked(execSync);

  beforeEach(() => {
    mockExecSync.mockReset();
    manager = new TailscaleManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Instance Properties ─────────────────────────────────────

  it('has name set to "tailscale"', () => {
    expect(manager.name).toBe('tailscale');
  });

  // ── healthCheck — online ────────────────────────────────────

  it('returns available:true when Tailscale is online', () => {
    mockExecSync.mockReturnValue(
      JSON.stringify({
        Self: { Online: true },
      }),
    );

    const result = manager.healthCheck();

    expect(result.available).toBe(true);
    expect(result.degraded).toBeUndefined();
  });

  // ── healthCheck — offline ───────────────────────────────────

  it('returns available:false when Tailscale is offline', () => {
    mockExecSync.mockReturnValue(
      JSON.stringify({
        Self: { Online: false },
      }),
    );

    const result = manager.healthCheck();

    expect(result.available).toBe(false);
    expect(result.degraded).toBe('Tailscale offline');
  });

  // ── healthCheck — missing Self.Online ───────────────────────

  it('returns available:false when Self.Online is missing', () => {
    mockExecSync.mockReturnValue(JSON.stringify({ Self: {} }));

    const result = manager.healthCheck();

    expect(result.available).toBe(false);
    expect(result.degraded).toBe('Tailscale offline');
  });

  it('returns available:false when Self is missing entirely', () => {
    mockExecSync.mockReturnValue(JSON.stringify({}));

    const result = manager.healthCheck();

    expect(result.available).toBe(false);
    expect(result.degraded).toBe('Tailscale offline');
  });

  // ── healthCheck — invalid JSON ──────────────────────────────

  it('returns degraded message when Tailscale returns invalid JSON', () => {
    mockExecSync.mockReturnValue('not valid json {{{');

    const result = manager.healthCheck();

    expect(result.available).toBe(false);
    expect(result.degraded).toBe('Tailscale returned invalid JSON');
  });

  it('returns degraded message for empty string output', () => {
    mockExecSync.mockReturnValue('');

    const result = manager.healthCheck();

    expect(result.available).toBe(false);
    expect(result.degraded).toBe('Tailscale returned invalid JSON');
  });

  // ── healthCheck — command failure ───────────────────────────

  it('returns degraded when tailscale command throws', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('command not found: tailscale');
    });

    const result = manager.healthCheck();

    expect(result.available).toBe(false);
    expect(result.degraded).toBe('Tailscale not installed or not running');
  });

  it('returns degraded when tailscale times out', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('ETIMEDOUT');
    });

    const result = manager.healthCheck();

    expect(result.available).toBe(false);
    expect(result.degraded).toBe('Tailscale not installed or not running');
  });

  // ── execSync call arguments ─────────────────────────────────

  it('calls execSync with correct command and options', () => {
    mockExecSync.mockReturnValue(JSON.stringify({ Self: { Online: true } }));

    manager.healthCheck();

    expect(mockExecSync).toHaveBeenCalledWith('tailscale status --json', {
      encoding: 'utf-8',
      timeout: 5_000,
      stdio: 'pipe',
    });
  });

  it('calls execSync exactly once per healthCheck call', () => {
    mockExecSync.mockReturnValue(JSON.stringify({ Self: { Online: true } }));

    manager.healthCheck();

    expect(mockExecSync).toHaveBeenCalledTimes(1);
  });

  // ── Edge cases ──────────────────────────────────────────────

  it('handles Online set to a truthy non-boolean', () => {
    mockExecSync.mockReturnValue(
      JSON.stringify({
        Self: { Online: 1 },
      }),
    );

    // The code uses ?? false, so non-nullish truthy values pass
    const result = manager.healthCheck();
    expect(result.available).toBe(true);
  });

  it('handles Online set to null (falsy via ??)', () => {
    mockExecSync.mockReturnValue(
      JSON.stringify({
        Self: { Online: null },
      }),
    );

    const result = manager.healthCheck();
    // null ?? false => false
    expect(result.available).toBe(false);
  });

  it('handles Online set to undefined (falsy via ??)', () => {
    // JSON.stringify drops undefined values, so Self: { Online: undefined } => Self: {}
    mockExecSync.mockReturnValue(JSON.stringify({ Self: {} }));

    const result = manager.healthCheck();
    expect(result.available).toBe(false);
  });
});
