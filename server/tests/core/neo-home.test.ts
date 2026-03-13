import { describe, it, expect, vi, afterAll } from 'vitest';
import { existsSync, lstatSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock NEO_HOME to a temp dir before importing NeoHome
const TEST_HOME = join(tmpdir(), `neo-home-test-${Date.now()}`);

vi.stubEnv('NEO_HOME', TEST_HOME);

const { NeoHome } = await import('../../src/core/neo-home.js');

describe('NeoHome', () => {
  afterAll(() => {
    try {
      rmSync(TEST_HOME, { recursive: true, force: true });
    } catch {}
  });

  it('resolves root to NEO_HOME env var', () => {
    expect(NeoHome.root).toBe(TEST_HOME);
  });

  it('resolves static paths under root', () => {
    expect(NeoHome.db).toBe(join(TEST_HOME, 'neo.db'));
    expect(NeoHome.configEnv).toBe(join(TEST_HOME, 'config.env'));
    expect(NeoHome.logs).toBe(join(TEST_HOME, 'logs'));
    expect(NeoHome.logFile).toBe(join(TEST_HOME, 'logs', 'neo.log'));
    expect(NeoHome.backups).toBe(join(TEST_HOME, 'backups'));
    expect(NeoHome.shared).toBe(join(TEST_HOME, 'shared'));
    expect(NeoHome.skills).toBe(join(TEST_HOME, 'shared', 'skills'));
    expect(NeoHome.agents).toBe(join(TEST_HOME, 'shared', 'agents'));
    expect(NeoHome.stories).toBe(join(TEST_HOME, 'shared', 'stories'));
    expect(NeoHome.workspaces).toBe(join(TEST_HOME, 'workspaces'));
    expect(NeoHome.tmpAgents).toBe(join(TEST_HOME, 'tmp', 'neo-agents'));
  });

  describe('ensureStructure', () => {
    it('creates all required directories', () => {
      NeoHome.ensureStructure();
      expect(existsSync(TEST_HOME)).toBe(true);
      expect(existsSync(join(TEST_HOME, 'logs'))).toBe(true);
      expect(existsSync(join(TEST_HOME, 'backups'))).toBe(true);
      expect(existsSync(join(TEST_HOME, 'shared'))).toBe(true);
      expect(existsSync(join(TEST_HOME, 'shared', 'skills'))).toBe(true);
      expect(existsSync(join(TEST_HOME, 'shared', 'agents'))).toBe(true);
      expect(existsSync(join(TEST_HOME, 'shared', 'stories'))).toBe(true);
      expect(existsSync(join(TEST_HOME, 'shared', '.claude'))).toBe(true);
      expect(existsSync(join(TEST_HOME, 'workspaces'))).toBe(true);
      expect(existsSync(join(TEST_HOME, 'tmp', 'neo-agents'))).toBe(true);
    });

    it('is idempotent', () => {
      NeoHome.ensureStructure();
      NeoHome.ensureStructure(); // should not throw
      expect(existsSync(TEST_HOME)).toBe(true);
    });
  });

  describe('workspace', () => {
    it('resolves CLI workspace', () => {
      const ws = NeoHome.workspace('cli', 'cli');
      expect(ws).toBe(join(TEST_HOME, 'workspaces', 'cli'));
      expect(existsSync(ws)).toBe(true);
    });

    it('resolves Telegram DM workspace', () => {
      const ws = NeoHome.workspace('telegram', '12345');
      expect(ws).toBe(join(TEST_HOME, 'workspaces', 'tg-dm-12345'));
      expect(existsSync(ws)).toBe(true);
    });

    it('resolves Telegram group workspace', () => {
      const ws = NeoHome.workspace('telegram', 'group:-100999');
      expect(ws).toBe(join(TEST_HOME, 'workspaces', 'tg-group--100999'));
      expect(existsSync(ws)).toBe(true);
    });

    it('resolves web workspace', () => {
      const ws = NeoHome.workspace('web', 'abc123');
      expect(ws).toBe(join(TEST_HOME, 'workspaces', 'web-abc123'));
      expect(existsSync(ws)).toBe(true);
    });

    it('creates symlinks to shared assets', () => {
      // Use a fresh workspace name that hasn't been cached
      const ws = NeoHome.workspace('telegram', 'symlink-test');
      expect(lstatSync(join(ws, 'skills')).isSymbolicLink()).toBe(true);
      expect(lstatSync(join(ws, 'agents')).isSymbolicLink()).toBe(true);
      expect(lstatSync(join(ws, 'stories')).isSymbolicLink()).toBe(true);
      expect(lstatSync(join(ws, '.claude')).isSymbolicLink()).toBe(true);
    });
  });
});
