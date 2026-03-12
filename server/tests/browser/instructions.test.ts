import { describe, expect, it } from 'vitest';
import { BROWSER_SYSTEM_INSTRUCTIONS } from '../../src/browser/instructions';

describe('Browser System Instructions', () => {
  it('is a non-empty string', () => {
    expect(typeof BROWSER_SYSTEM_INSTRUCTIONS).toBe('string');
    expect(BROWSER_SYSTEM_INSTRUCTIONS.length).toBeGreaterThan(100);
  });

  it('contains the main header', () => {
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('## Browser Automation (agent-browser)');
  });

  // ─── Core Workflow Section ──────────────────────────────────

  it('documents the core workflow: navigate, snapshot, interact, re-snapshot', () => {
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('### Core Workflow');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('Navigate');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('snapshot');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('Interact');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('Re-snapshot');
  });

  // ─── Navigation Commands ────────────────────────────────────

  it('documents navigation commands', () => {
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('npx agent-browser open <url>');
    // back/forward/reload are combined on one line: "back` / `forward` / `reload`"
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('npx agent-browser back');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('forward');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('reload');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('npx agent-browser get url');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('npx agent-browser get title');
  });

  // ─── Reading Commands ───────────────────────────────────────

  it('documents reading commands including snapshot and screenshot', () => {
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('npx agent-browser snapshot -i');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('npx agent-browser snapshot');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('npx agent-browser get text');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('npx agent-browser get html');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('npx agent-browser screenshot');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('npx agent-browser screenshot --full');
  });

  // ─── Interaction Commands ───────────────────────────────────

  it('documents interaction commands', () => {
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('npx agent-browser click @e1');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('npx agent-browser fill @e2');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('npx agent-browser type');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('npx agent-browser press Enter');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('npx agent-browser select @e3');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('npx agent-browser hover @e4');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('check @e5');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('uncheck @e5');
  });

  // ─── Waiting Commands ───────────────────────────────────────

  it('documents waiting commands', () => {
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('npx agent-browser wait');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('--load networkidle');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('--url');
  });

  // ─── Tab Management ─────────────────────────────────────────

  it('documents tab management commands', () => {
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('npx agent-browser tab');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('tab new');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('tab 2');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('tab close');
  });

  // ─── Debugging ──────────────────────────────────────────────

  it('documents debugging commands', () => {
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('npx agent-browser console');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('npx agent-browser errors');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('get styles');
  });

  // ─── Auth & State ──────────────────────────────────────────

  it('documents auth and state persistence commands', () => {
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('auth save');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('auth login');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('state save');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('state load');
  });

  // ─── Best Practices ────────────────────────────────────────

  it('includes best practices section', () => {
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('### Best Practices');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('snapshot -i');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('element refs');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('@e1');
  });

  it('mentions element refs (@e1, @e2) as the reliable targeting method', () => {
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('@e1');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('@e2');
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('refs expire');
  });

  it('recommends re-snapshot after navigation', () => {
    expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain('re-snapshot');
  });

  // ─── Section Completeness ──────────────────────────────────

  it('contains all major section headers', () => {
    const sections = [
      '### Core Workflow',
      '### Common Commands',
      '**Navigation:**',
      '**Reading:**',
      '**Interaction:**',
      '**Waiting:**',
      '**Tabs:**',
      '**Debugging:**',
      '**Auth & State:**',
      '### Best Practices',
    ];

    for (const section of sections) {
      expect(BROWSER_SYSTEM_INSTRUCTIONS).toContain(section);
    }
  });
});
