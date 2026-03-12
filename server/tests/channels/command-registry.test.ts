import { describe, expect, it } from 'vitest';
import {
  COMMANDS,
  formatCommandsText,
  getCommandsForChannel,
  type CommandDef,
} from '../../src/channels/command-registry';

describe('Command Registry', () => {
  // ─── COMMANDS array ──────────────────────────────────────────

  describe('COMMANDS array', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(COMMANDS)).toBe(true);
      expect(COMMANDS.length).toBeGreaterThan(0);
    });

    it('contains all expected commands', () => {
      const commandNames = COMMANDS.map((c) => c.command);

      // Core session commands
      expect(commandNames).toContain('/session');
      expect(commandNames).toContain('/sessions');
      expect(commandNames).toContain('/stats');
      expect(commandNames).toContain('/new');

      // Model & routing
      expect(commandNames).toContain('/route');
      expect(commandNames).toContain('/model');

      // Memory
      expect(commandNames).toContain('/memory');
      expect(commandNames).toContain('/remember');

      // Conversation management
      expect(commandNames).toContain('/compact');
      expect(commandNames).toContain('/retry');
      expect(commandNames).toContain('/export');

      // Dev & debug
      expect(commandNames).toContain('/debug');
      expect(commandNames).toContain('/neo-dev');

      // Tasks
      expect(commandNames).toContain('/tasks');
      expect(commandNames).toContain('/task');

      // Help & exit
      expect(commandNames).toContain('/help');
      expect(commandNames).toContain('/exit');

      // CLI-only
      expect(commandNames).toContain('/onboard');
      expect(commandNames).toContain('/clear');
    });

    it('every command starts with /', () => {
      for (const cmd of COMMANDS) {
        expect(cmd.command.startsWith('/')).toBe(true);
      }
    });

    it('every command has a non-empty description', () => {
      for (const cmd of COMMANDS) {
        expect(cmd.description).toBeTruthy();
        expect(cmd.description.length).toBeGreaterThan(0);
      }
    });

    it('every command has at least one channel', () => {
      for (const cmd of COMMANDS) {
        expect(cmd.channels.length).toBeGreaterThan(0);
      }
    });

    it('channels only contain valid values', () => {
      const validChannels = new Set(['cli', 'telegram', 'web']);
      for (const cmd of COMMANDS) {
        for (const ch of cmd.channels) {
          expect(validChannels.has(ch)).toBe(true);
        }
      }
    });

    it('has no duplicate command names', () => {
      const names = COMMANDS.map((c) => c.command);
      const unique = new Set(names);
      expect(unique.size).toBe(names.length);
    });
  });

  // ─── /neo-dev command ────────────────────────────────────────

  describe('/neo-dev command', () => {
    it('exists in the registry', () => {
      const neoDev = COMMANDS.find((c) => c.command === '/neo-dev');
      expect(neoDev).toBeDefined();
    });

    it('is available on both CLI and Telegram', () => {
      const neoDev = COMMANDS.find((c) => c.command === '/neo-dev')!;
      expect(neoDev.channels).toContain('cli');
      expect(neoDev.channels).toContain('telegram');
    });

    it('has args for on/off', () => {
      const neoDev = COMMANDS.find((c) => c.command === '/neo-dev')!;
      expect(neoDev.args).toBeDefined();
      expect(neoDev.args).toContain('on');
      expect(neoDev.args).toContain('off');
    });
  });

  // ─── CLI-only commands ──────────────────────────────────────

  describe('CLI-only commands', () => {
    const cliOnlyNames = ['/exit', '/clear', '/onboard'];

    for (const name of cliOnlyNames) {
      it(`${name} is CLI-only`, () => {
        const cmd = COMMANDS.find((c) => c.command === name);
        expect(cmd).toBeDefined();
        expect(cmd!.channels).toEqual(['cli']);
      });
    }
  });

  // ─── Cross-channel commands ─────────────────────────────────

  describe('cross-channel commands', () => {
    const sharedNames = [
      '/session',
      '/sessions',
      '/stats',
      '/route',
      '/memory',
      '/remember',
      '/new',
      '/compact',
      '/retry',
      '/model',
      '/export',
      '/debug',
      '/tasks',
      '/task',
      '/neo-dev',
      '/help',
    ];

    for (const name of sharedNames) {
      it(`${name} is available on both CLI and Telegram`, () => {
        const cmd = COMMANDS.find((c) => c.command === name);
        expect(cmd).toBeDefined();
        expect(cmd!.channels).toContain('cli');
        expect(cmd!.channels).toContain('telegram');
      });
    }
  });

  // ─── getCommandsForChannel ──────────────────────────────────

  describe('getCommandsForChannel', () => {
    it('returns only CLI commands for cli channel', () => {
      const cliCmds = getCommandsForChannel('cli');
      for (const cmd of cliCmds) {
        expect(cmd.channels).toContain('cli');
      }
    });

    it('returns only Telegram commands for telegram channel', () => {
      const tgCmds = getCommandsForChannel('telegram');
      for (const cmd of tgCmds) {
        expect(cmd.channels).toContain('telegram');
      }
    });

    it('CLI has more commands than Telegram (CLI-only commands)', () => {
      const cliCmds = getCommandsForChannel('cli');
      const tgCmds = getCommandsForChannel('telegram');
      expect(cliCmds.length).toBeGreaterThan(tgCmds.length);
    });

    it('excludes CLI-only commands from Telegram', () => {
      const tgCmds = getCommandsForChannel('telegram');
      const tgNames = tgCmds.map((c) => c.command);
      expect(tgNames).not.toContain('/exit');
      expect(tgNames).not.toContain('/clear');
      expect(tgNames).not.toContain('/onboard');
    });

    it('includes /help in both CLI and Telegram', () => {
      const cliCmds = getCommandsForChannel('cli');
      const tgCmds = getCommandsForChannel('telegram');
      expect(cliCmds.map((c) => c.command)).toContain('/help');
      expect(tgCmds.map((c) => c.command)).toContain('/help');
    });

    it('returns an array even for a channel with no commands', () => {
      const webCmds = getCommandsForChannel('web');
      expect(Array.isArray(webCmds)).toBe(true);
    });

    it('returns correct CommandDef objects with all fields', () => {
      const cmds = getCommandsForChannel('cli');
      for (const cmd of cmds) {
        expect(typeof cmd.command).toBe('string');
        expect(typeof cmd.description).toBe('string');
        expect(Array.isArray(cmd.channels)).toBe(true);
      }
    });
  });

  // ─── formatCommandsText ────────────────────────────────────

  describe('formatCommandsText', () => {
    it('returns a non-empty string for CLI', () => {
      const text = formatCommandsText('cli');
      expect(text.length).toBeGreaterThan(0);
    });

    it('returns a non-empty string for Telegram', () => {
      const text = formatCommandsText('telegram');
      expect(text.length).toBeGreaterThan(0);
    });

    it('contains all CLI commands in the formatted text', () => {
      const text = formatCommandsText('cli');
      const cliCmds = getCommandsForChannel('cli');
      for (const cmd of cliCmds) {
        expect(text).toContain(cmd.command);
      }
    });

    it('includes descriptions in the formatted text', () => {
      const text = formatCommandsText('cli');
      const cliCmds = getCommandsForChannel('cli');
      for (const cmd of cliCmds) {
        expect(text).toContain(cmd.description);
      }
    });

    it('uses em-dash separator between command and description', () => {
      const text = formatCommandsText('cli');
      const lines = text.split('\n');
      for (const line of lines) {
        expect(line).toContain(' \u2014 ');
      }
    });

    it('produces one line per command', () => {
      const text = formatCommandsText('cli');
      const lines = text.split('\n');
      const cliCmds = getCommandsForChannel('cli');
      expect(lines.length).toBe(cliCmds.length);
    });

    it('pads commands to aligned columns', () => {
      const text = formatCommandsText('cli');
      const lines = text.split('\n');
      // All lines should have the same position for the em-dash
      const dashPositions = lines.map((line) => line.indexOf(' \u2014 '));
      // All should be the same position (aligned padding)
      const uniquePositions = new Set(dashPositions);
      expect(uniquePositions.size).toBe(1);
    });

    it('includes args in the command portion when present', () => {
      const text = formatCommandsText('cli');
      // /session has args '<name>'
      expect(text).toContain('/session <name>');
      // /model has args '<haiku|sonnet|opus>'
      expect(text).toContain('/model <haiku|sonnet|opus>');
    });

    it('excludes CLI-only commands from Telegram formatted text', () => {
      const text = formatCommandsText('telegram');
      expect(text).not.toContain('/exit');
      expect(text).not.toContain('/clear');
      expect(text).not.toContain('/onboard');
    });
  });
});
