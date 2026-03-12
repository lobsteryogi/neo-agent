import { existsSync, mkdirSync, rmdirSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureDir } from '../../src/utils/fs.js';

describe('fs — ensureDir', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = join(tmpdir(), `neo-test-fs-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(() => {
    // Clean up recursively
    try {
      // Remove nested directories from deepest to shallowest
      const removeDirRecursive = (dir: string) => {
        if (!existsSync(dir)) return;
        const { readdirSync } = require('fs');
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            removeDirRecursive(fullPath);
          }
        }
        rmdirSync(dir);
      };
      removeDirRecursive(testRoot);
    } catch {
      // Best effort cleanup
    }
  });

  it('creates a directory that does not exist', () => {
    const dirPath = join(testRoot, 'new-dir');
    expect(existsSync(dirPath)).toBe(false);
    ensureDir(dirPath);
    expect(existsSync(dirPath)).toBe(true);
    expect(statSync(dirPath).isDirectory()).toBe(true);
  });

  it('creates nested directories recursively', () => {
    const dirPath = join(testRoot, 'a', 'b', 'c');
    expect(existsSync(dirPath)).toBe(false);
    ensureDir(dirPath);
    expect(existsSync(dirPath)).toBe(true);
    expect(statSync(dirPath).isDirectory()).toBe(true);
  });

  it('does not throw when directory already exists', () => {
    const dirPath = join(testRoot, 'existing');
    mkdirSync(dirPath, { recursive: true });
    expect(existsSync(dirPath)).toBe(true);
    expect(() => ensureDir(dirPath)).not.toThrow();
    expect(existsSync(dirPath)).toBe(true);
  });

  it('is idempotent — calling twice has no effect', () => {
    const dirPath = join(testRoot, 'idempotent');
    ensureDir(dirPath);
    ensureDir(dirPath);
    expect(existsSync(dirPath)).toBe(true);
  });
});
