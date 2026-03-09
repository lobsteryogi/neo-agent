import { describe, expect, it, vi } from 'vitest';
import { BrowserTool } from '../../src/tools/browser';
import { SchedulerTool } from '../../src/tools/scheduler';

describe('Tool Health Checks (Audit Fix S3)', () => {
  // ── Browser Tool ───────────────────────────────────────────

  it('BrowserTool checks CLI availability', async () => {
    const browser = new BrowserTool();
    const health = await browser.healthCheck();
    expect(typeof health.available).toBe('boolean');
    // On most dev machines, agent-browser is NOT installed
    if (!health.available) {
      expect(health.degraded).toContain('agent-browser');
    }
  });

  it('BrowserTool has a fallback description', () => {
    const browser = new BrowserTool();
    expect(browser.fallback?.()).toContain('agent-browser');
  });

  it('BrowserTool name is agent-browser', () => {
    const browser = new BrowserTool();
    expect(browser.name).toBe('agent-browser');
  });

  // ── Scheduler Tool ─────────────────────────────────────────

  it('SchedulerTool is always available (local)', async () => {
    const scheduler = new SchedulerTool();
    const health = await scheduler.healthCheck();
    expect(health.available).toBe(true);
  });

  it('SchedulerTool name is cron', () => {
    const scheduler = new SchedulerTool();
    expect(scheduler.name).toBe('cron');
  });

  it('SchedulerTool can schedule and cancel tasks', () => {
    const scheduler = new SchedulerTool();
    const fn = vi.fn();

    const ok = scheduler.schedule('test-task', '* * * * *', fn);
    expect(ok).toBe(true);
    expect(scheduler.listTasks()).toContain('test-task');

    const cancelled = scheduler.cancel('test-task');
    expect(cancelled).toBe(true);
    expect(scheduler.listTasks()).not.toContain('test-task');

    scheduler.destroy();
  });

  it('SchedulerTool rejects invalid cron expressions', () => {
    const scheduler = new SchedulerTool();
    const ok = scheduler.schedule('bad', 'not-a-cron', vi.fn());
    expect(ok).toBe(false);
    scheduler.destroy();
  });

  it('SchedulerTool replaces existing task with same name', () => {
    const scheduler = new SchedulerTool();
    scheduler.schedule('dup', '* * * * *', vi.fn());
    scheduler.schedule('dup', '*/5 * * * *', vi.fn());
    expect(scheduler.listTasks()).toEqual(['dup']);
    scheduler.destroy();
  });
});
