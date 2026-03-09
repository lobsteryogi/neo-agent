/**
 * ░▒▓ SCHEDULER TOOL ▓▒░
 *
 * "The Clock."
 *
 * "Sooner or later you're going to realize, just as I did,
 *  that there's a difference between knowing the path
 *  and walking the path."
 *
 * Cron-based task scheduler using `node-cron`.
 */

import type { ToolHealth } from '@neo-agent/shared';
import cron from 'node-cron';
import type { ToolIntegration } from './registry.js';

export class SchedulerTool implements ToolIntegration {
  name = 'cron';
  private tasks = new Map<string, cron.ScheduledTask>();

  /** Schedule a recurring task */
  schedule(name: string, cronExpr: string, fn: () => void): boolean {
    if (!cron.validate(cronExpr)) return false;

    // Cancel existing task with same name
    this.cancel(name);

    this.tasks.set(name, cron.schedule(cronExpr, fn));
    return true;
  }

  /** Cancel a scheduled task */
  cancel(name: string): boolean {
    const existing = this.tasks.get(name);
    if (existing) {
      existing.stop();
      this.tasks.delete(name);
      return true;
    }
    return false;
  }

  /** List all active task names */
  listTasks(): string[] {
    return [...this.tasks.keys()];
  }

  /** Cron is local, always available — warns if task count is high */
  async healthCheck(): Promise<ToolHealth> {
    const count = this.tasks.size;
    return {
      available: true,
      degraded: count > 50 ? `${count} active tasks — consider cleanup` : undefined,
    };
  }

  /** Stop all scheduled tasks */
  destroy(): void {
    for (const task of this.tasks.values()) {
      task.stop();
    }
    this.tasks.clear();
  }
}
