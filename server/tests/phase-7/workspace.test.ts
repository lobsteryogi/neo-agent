import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentWorkspace } from '../../src/agents/workspace';

describe('AgentWorkspace', () => {
  const tempDir = join(__dirname, '__tmp_workspace__');
  let workspace: AgentWorkspace;

  beforeEach(() => {
    workspace = new AgentWorkspace(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates isolated workspace with output directory', () => {
    const ws = workspace.create({
      taskId: 'task-1',
      agentName: 'coder',
    });

    expect(existsSync(ws.baseDir)).toBe(true);
    expect(existsSync(ws.outDir)).toBe(true);
  });

  it('writes CLAUDE.md with agent name and task', () => {
    const ws = workspace.create({
      taskId: 'task-2',
      agentName: 'reviewer',
      claudeMd: 'Custom instructions here.',
    });

    const claudeMd = readFileSync(join(ws.baseDir, 'CLAUDE.md'), 'utf-8');
    expect(claudeMd).toContain('reviewer');
    expect(claudeMd).toContain('task-2');
    expect(claudeMd).toContain('Custom instructions here.');
  });

  it('collects artifacts from output directory', () => {
    const ws = workspace.create({ taskId: 'task-3', agentName: 'coder' });
    writeFileSync(join(ws.outDir, 'result.md'), '# Result\n\nDone.');

    const artifacts = workspace.collectArtifacts(ws);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].name).toBe('result.md');
    expect(artifacts[0].type).toBe('file');
    expect(artifacts[0].sizeBytes).toBeGreaterThan(0);
  });

  it('cleanup removes the entire workspace directory', () => {
    const ws = workspace.create({ taskId: 'task-4', agentName: 'planner' });
    expect(existsSync(ws.baseDir)).toBe(true);

    workspace.cleanup(ws);
    expect(existsSync(ws.baseDir)).toBe(false);
  });
});
