import { WIZARD_DEFAULTS } from '@neo-agent/shared';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateClaudeSettings, generateWorkspaceFiles } from '../../src/onboard/wizard.js';

describe('Phase 0 — Workspace Files', () => {
  const tmpDir = join(__dirname, '__tmp_workspace__');

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates AGENTS.md with user and agent names', () => {
    generateWorkspaceFiles({ ...WIZARD_DEFAULTS, userName: 'TestUser' }, tmpDir);
    const content = readFileSync(join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('TestUser');
    expect(content).toContain(WIZARD_DEFAULTS.agentName);
  });

  it('creates SOUL.md with personality info', () => {
    generateWorkspaceFiles(WIZARD_DEFAULTS, tmpDir);
    const content = readFileSync(join(tmpDir, 'SOUL.md'), 'utf-8');
    expect(content).toContain(WIZARD_DEFAULTS.personalityIntensity);
  });

  it('creates TOOLS.md', () => {
    generateWorkspaceFiles(WIZARD_DEFAULTS, tmpDir);
    expect(existsSync(join(tmpDir, 'TOOLS.md'))).toBe(true);
  });

  it('creates stories directory with 5 default stories', () => {
    generateWorkspaceFiles(WIZARD_DEFAULTS, tmpDir);
    const storiesDir = join(tmpDir, 'stories');
    expect(existsSync(storiesDir)).toBe(true);
    expect(existsSync(join(storiesDir, '01-who-i-am.md'))).toBe(true);
    expect(existsSync(join(storiesDir, '05-my-mission.md'))).toBe(true);
  });

  it('creates skills directory', () => {
    generateWorkspaceFiles(WIZARD_DEFAULTS, tmpDir);
    expect(existsSync(join(tmpDir, 'skills'))).toBe(true);
  });

  it('does NOT overwrite existing files', () => {
    generateWorkspaceFiles(WIZARD_DEFAULTS, tmpDir);
    const original = readFileSync(join(tmpDir, 'AGENTS.md'), 'utf-8');

    // Run again — should not overwrite
    generateWorkspaceFiles({ ...WIZARD_DEFAULTS, userName: 'DifferentUser' }, tmpDir);
    const afterSecondRun = readFileSync(join(tmpDir, 'AGENTS.md'), 'utf-8');

    expect(afterSecondRun).toBe(original); // Unchanged
  });

  it('Claude settings.json includes allow and deny lists', () => {
    generateClaudeSettings(WIZARD_DEFAULTS, tmpDir);
    const settingsPath = join(tmpDir, '.claude', 'settings.json');
    expect(existsSync(settingsPath)).toBe(true);

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(settings.permissions.allow).toContain('Read(*)');
    expect(settings.permissions.deny).toContain('Bash(rm -rf *)');
    expect(settings.permissions.deny).toContain('Write(~/.ssh/*)');
  });

  it('stories contain the gate phrase', () => {
    generateWorkspaceFiles(WIZARD_DEFAULTS, tmpDir);
    const rules = readFileSync(join(tmpDir, 'stories', '03-my-rules.md'), 'utf-8');
    expect(rules).toContain(WIZARD_DEFAULTS.gatePhrase);
  });
});
