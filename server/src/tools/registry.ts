/**
 * ░▒▓ TOOL REGISTRY ▓▒░
 *
 * "We have a lot of bullets."
 *
 * Unified registry for tool integrations.
 * Every tool implements ToolIntegration — health check + optional fallback.
 * Addresses Audit Fix S3: standardized tool health checks.
 */

import type { ToolHealth } from '@neo-agent/shared';

/**
 * Every tool integration must implement this interface (Audit Fix S3).
 */
export interface ToolIntegration {
  /** Unique tool identifier */
  name: string;

  /** Whether this tool is required for core operation (affects health status) */
  required?: boolean;

  /** Check if the tool is available and healthy */
  healthCheck(): Promise<ToolHealth>;

  /** Optional fallback behavior description when tool is unavailable */
  fallback?(): string;
}

/**
 * Central registry of all tool integrations.
 */
export class ToolRegistry {
  private tools = new Map<string, ToolIntegration>();

  /** Register a tool integration */
  register(tool: ToolIntegration): void {
    this.tools.set(tool.name, tool);
  }

  /** Get a specific tool by name */
  get(name: string): ToolIntegration | undefined {
    return this.tools.get(name);
  }

  /** Get all registered tools */
  getAll(): ToolIntegration[] {
    return [...this.tools.values()];
  }

  /** Check if a tool is registered */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** Number of registered tools */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Run health checks on all registered tools.
   * Returns a map of tool name → ToolHealth.
   */
  async healthCheckAll(): Promise<Record<string, ToolHealth>> {
    const results: Record<string, ToolHealth> = {};

    const checks = this.getAll().map(async (tool) => {
      try {
        results[tool.name] = await tool.healthCheck();
      } catch {
        results[tool.name] = { available: false, degraded: 'Health check threw an exception' };
      }
    });

    await Promise.all(checks);
    return results;
  }
}
