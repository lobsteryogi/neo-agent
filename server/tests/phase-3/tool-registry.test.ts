import { describe, expect, it, vi } from 'vitest';
import type { ToolIntegration } from '../../src/tools/registry';
import { ToolRegistry } from '../../src/tools/registry';

/** Mock tool that is always available */
class MockToolAvailable implements ToolIntegration {
  name = 'mock-available';
  async healthCheck() {
    return { available: true };
  }
}

/** Mock tool that is degraded */
class MockToolDegraded implements ToolIntegration {
  name = 'mock-degraded';
  async healthCheck() {
    return { available: true, degraded: 'Running in compatibility mode' };
  }
}

/** Mock tool that is unavailable */
class MockToolDown implements ToolIntegration {
  name = 'mock-down';
  async healthCheck() {
    return { available: false, degraded: 'Service unreachable' };
  }
}

/** Mock tool whose health check throws */
class MockToolThrows implements ToolIntegration {
  name = 'mock-throws';
  async healthCheck() {
    throw new Error('Unexpected failure');
  }
}

describe('ToolRegistry', () => {
  it('registers and retrieves tools', () => {
    const registry = new ToolRegistry();
    registry.register(new MockToolAvailable());

    expect(registry.size).toBe(1);
    expect(registry.has('mock-available')).toBe(true);
    expect(registry.get('mock-available')).toBeDefined();
    expect(registry.get('mock-available')?.name).toBe('mock-available');
  });

  it('returns undefined for unregistered tools', () => {
    const registry = new ToolRegistry();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('lists all registered tools', () => {
    const registry = new ToolRegistry();
    registry.register(new MockToolAvailable());
    registry.register(new MockToolDegraded());

    const all = registry.getAll();
    expect(all).toHaveLength(2);
    expect(all.map((t) => t.name)).toContain('mock-available');
    expect(all.map((t) => t.name)).toContain('mock-degraded');
  });

  it('healthCheckAll returns status for all tools', async () => {
    const registry = new ToolRegistry();
    registry.register(new MockToolAvailable());
    registry.register(new MockToolDegraded());
    registry.register(new MockToolDown());

    const results = await registry.healthCheckAll();

    expect(results['mock-available']).toEqual({ available: true });
    expect(results['mock-degraded']).toEqual({
      available: true,
      degraded: 'Running in compatibility mode',
    });
    expect(results['mock-down']).toEqual({
      available: false,
      degraded: 'Service unreachable',
    });
  });

  it('healthCheckAll handles exceptions gracefully', async () => {
    const registry = new ToolRegistry();
    registry.register(new MockToolAvailable());
    registry.register(new MockToolThrows());

    const results = await registry.healthCheckAll();

    expect(results['mock-available'].available).toBe(true);
    expect(results['mock-throws'].available).toBe(false);
    expect(results['mock-throws'].degraded).toContain('exception');
  });

  it('replaces tool with same name on re-register', () => {
    const registry = new ToolRegistry();
    registry.register(new MockToolAvailable());
    registry.register(new MockToolAvailable()); // same name
    expect(registry.size).toBe(1);
  });
});
