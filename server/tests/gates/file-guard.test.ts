import { describe, expect, it } from 'vitest';
import { FileGuard } from '../../src/gates/file-guard';
import type { InboundMessage, PlannedAction, RouteDecision } from '@neo-agent/shared';

// ─── Helpers ────────────────────────────────────────────────────

function routeWith(actions: PlannedAction[]): Partial<RouteDecision> {
  return { plannedActions: actions };
}

function writeAction(path: string): PlannedAction {
  return { type: 'write', path };
}

function deleteAction(path: string): PlannedAction {
  return { type: 'delete', path };
}

function readAction(path: string): PlannedAction {
  return { type: 'read', path };
}

function execAction(command: string): PlannedAction {
  return { type: 'execute', command };
}

const emptyMsg: Partial<InboundMessage> = {};

// ─── Tests ──────────────────────────────────────────────────────

describe('FileGuard', () => {
  describe('construction', () => {
    it('exposes name "FileGuard"', () => {
      const guard = new FileGuard({ enabled: true });
      expect(guard.name).toBe('FileGuard');
    });

    it('reflects enabled flag from config', () => {
      expect(new FileGuard({ enabled: true }).enabled).toBe(true);
      expect(new FileGuard({ enabled: false }).enabled).toBe(false);
    });

    it('uses default protected paths when none provided', async () => {
      const guard = new FileGuard({ enabled: true });
      // Default includes ~/.ssh/, ~/.gnupg/, .env
      const sshResult = await guard.check(
        emptyMsg as any,
        routeWith([writeAction('~/.ssh/id_rsa')]) as any,
      );
      expect(sshResult.blocked).toBe(true);

      const gnupgResult = await guard.check(
        emptyMsg as any,
        routeWith([writeAction('~/.gnupg/pubring.kbx')]) as any,
      );
      expect(gnupgResult.blocked).toBe(true);

      const envResult = await guard.check(
        emptyMsg as any,
        routeWith([writeAction('/project/.env')]) as any,
      );
      expect(envResult.blocked).toBe(true);
    });

    it('uses custom protected paths when provided', async () => {
      const guard = new FileGuard({
        enabled: true,
        protectedPaths: ['/secrets/'],
      });
      // Custom path blocked
      const blocked = await guard.check(
        emptyMsg as any,
        routeWith([writeAction('/secrets/api-key.txt')]) as any,
      );
      expect(blocked.blocked).toBe(true);

      // Default paths NOT blocked since custom set overrides
      const notBlocked = await guard.check(
        emptyMsg as any,
        routeWith([writeAction('~/.ssh/config')]) as any,
      );
      expect(notBlocked.blocked).toBe(false);
    });
  });

  describe('write actions', () => {
    const guard = new FileGuard({
      enabled: true,
      protectedPaths: ['~/.ssh/', '~/.gnupg/', '.env'],
    });

    it('blocks write to ~/.ssh/authorized_keys', async () => {
      const result = await guard.check(
        emptyMsg as any,
        routeWith([writeAction('~/.ssh/authorized_keys')]) as any,
      );
      expect(result.blocked).toBe(true);
      expect(result.gate).toBe('FileGuard');
      expect(result.reason).toContain('.ssh');
      expect(result.reason).toContain('write');
    });

    it('blocks write to ~/.gnupg/trustdb.gpg', async () => {
      const result = await guard.check(
        emptyMsg as any,
        routeWith([writeAction('~/.gnupg/trustdb.gpg')]) as any,
      );
      expect(result.blocked).toBe(true);
    });

    it('blocks write to .env at project root', async () => {
      const result = await guard.check(
        emptyMsg as any,
        routeWith([writeAction('/myproject/.env')]) as any,
      );
      expect(result.blocked).toBe(true);
    });

    it('blocks write to .env.production (starts with .env)', async () => {
      const result = await guard.check(
        emptyMsg as any,
        routeWith([writeAction('/project/.env.production')]) as any,
      );
      expect(result.blocked).toBe(true);
    });

    it('includes pendingAction in blocked verdict', async () => {
      const action = writeAction('~/.ssh/id_rsa');
      const result = await guard.check(emptyMsg as any, routeWith([action]) as any);
      expect(result.blocked).toBe(true);
      expect(result.pendingAction).toEqual([action]);
    });

    it('includes neoQuip in blocked verdict', async () => {
      const result = await guard.check(
        emptyMsg as any,
        routeWith([writeAction('~/.ssh/config')]) as any,
      );
      expect(result.neoQuip).toBeDefined();
      expect(result.neoQuip).toContain('Sentinel');
    });

    it('allows write to normal source files', async () => {
      const result = await guard.check(
        emptyMsg as any,
        routeWith([writeAction('/project/src/index.ts')]) as any,
      );
      expect(result.blocked).toBe(false);
    });

    it('allows write to non-protected config files', async () => {
      const result = await guard.check(
        emptyMsg as any,
        routeWith([writeAction('/project/tsconfig.json')]) as any,
      );
      expect(result.blocked).toBe(false);
    });
  });

  describe('delete actions', () => {
    const guard = new FileGuard({
      enabled: true,
      protectedPaths: ['~/.ssh/', '.env'],
    });

    it('blocks delete of protected files', async () => {
      const result = await guard.check(
        emptyMsg as any,
        routeWith([deleteAction('~/.ssh/known_hosts')]) as any,
      );
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('delete');
    });

    it('allows delete of non-protected files', async () => {
      const result = await guard.check(
        emptyMsg as any,
        routeWith([deleteAction('/tmp/garbage.txt')]) as any,
      );
      expect(result.blocked).toBe(false);
    });
  });

  describe('read actions — always allowed', () => {
    const guard = new FileGuard({
      enabled: true,
      protectedPaths: ['~/.ssh/', '.env'],
    });

    it('allows read from ~/.ssh/config', async () => {
      const result = await guard.check(
        emptyMsg as any,
        routeWith([readAction('~/.ssh/config')]) as any,
      );
      expect(result.blocked).toBe(false);
    });

    it('allows read from .env', async () => {
      const result = await guard.check(
        emptyMsg as any,
        routeWith([readAction('/project/.env')]) as any,
      );
      expect(result.blocked).toBe(false);
    });
  });

  describe('execute actions', () => {
    const guard = new FileGuard({
      enabled: true,
      protectedPaths: ['~/.ssh/'],
    });

    it('execute with no path is not blocked', async () => {
      const result = await guard.check(emptyMsg as any, routeWith([execAction('ls -la')]) as any);
      expect(result.blocked).toBe(false);
    });
  });

  describe('multiple actions', () => {
    const guard = new FileGuard({
      enabled: true,
      protectedPaths: ['~/.ssh/', '.env'],
    });

    it('passes when all actions target safe paths', async () => {
      const result = await guard.check(
        emptyMsg as any,
        routeWith([
          writeAction('/src/app.ts'),
          writeAction('/src/util.ts'),
          readAction('~/.ssh/config'),
        ]) as any,
      );
      expect(result.blocked).toBe(false);
    });

    it('blocks on the first protected write in a list', async () => {
      const result = await guard.check(
        emptyMsg as any,
        routeWith([
          writeAction('/src/app.ts'),
          writeAction('~/.ssh/id_rsa'),
          writeAction('/project/.env'),
        ]) as any,
      );
      expect(result.blocked).toBe(true);
      // Should block on the ssh path (first protected hit)
      expect(result.reason).toContain('.ssh');
    });
  });

  describe('case insensitivity', () => {
    const guard = new FileGuard({
      enabled: true,
      protectedPaths: ['~/.ssh/', '.env'],
    });

    it('blocks with uppercase path variations', async () => {
      const result = await guard.check(
        emptyMsg as any,
        routeWith([writeAction('~/.SSH/id_rsa')]) as any,
      );
      expect(result.blocked).toBe(true);
    });

    it('blocks .ENV files (case insensitive)', async () => {
      const result = await guard.check(
        emptyMsg as any,
        routeWith([writeAction('/project/.ENV')]) as any,
      );
      expect(result.blocked).toBe(true);
    });
  });

  describe('edge cases', () => {
    const guard = new FileGuard({
      enabled: true,
      protectedPaths: ['~/.ssh/'],
    });

    it('handles empty actions list', async () => {
      const result = await guard.check(emptyMsg as any, routeWith([]) as any);
      expect(result.blocked).toBe(false);
    });

    it('handles missing plannedActions', async () => {
      const result = await guard.check(emptyMsg as any, {} as any);
      expect(result.blocked).toBe(false);
    });

    it('handles null route', async () => {
      const result = await guard.check(emptyMsg as any, null as any);
      expect(result.blocked).toBe(false);
    });

    it('handles action with no path', async () => {
      const result = await guard.check(
        emptyMsg as any,
        routeWith([{ type: 'write' } as PlannedAction]) as any,
      );
      expect(result.blocked).toBe(false);
    });
  });
});
