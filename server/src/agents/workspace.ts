/**
 * ░▒▓ AGENT WORKSPACE ▓▒░
 *
 * "There is no spoon."
 *
 * NanoClaw-inspired filesystem isolation. Each sub-agent gets a scoped
 * working directory with a writable output area.
 */

import type { AgentArtifact } from '@neo-agent/shared';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface WorkspaceOptions {
  taskId: string;
  agentName: string;
  claudeMd?: string;
}

export interface IsolatedWorkspace {
  baseDir: string;
  outDir: string;
}

export class AgentWorkspace {
  constructor(private tempDir: string) {}

  create(opts: WorkspaceOptions): IsolatedWorkspace {
    const baseDir = join(this.tempDir, 'agents', opts.taskId);
    const outDir = join(baseDir, 'output');

    mkdirSync(outDir, { recursive: true });

    // Write CLAUDE.md with agent identity and task context
    const claudeContent = [
      `# Agent: ${opts.agentName}`,
      `# Task ID: ${opts.taskId}`,
      '',
      'Write all output files to the ./output/ directory.',
      '',
      opts.claudeMd ?? '',
    ].join('\n');

    writeFileSync(join(baseDir, 'CLAUDE.md'), claudeContent);

    return { baseDir, outDir };
  }

  collectArtifacts(workspace: IsolatedWorkspace): AgentArtifact[] {
    if (!existsSync(workspace.outDir)) return [];

    const artifacts: AgentArtifact[] = [];
    const entries = readdirSync(workspace.outDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(workspace.outDir, entry.name);
      artifacts.push({
        name: entry.name,
        path: fullPath,
        type: entry.isDirectory() ? 'directory' : 'file',
        sizeBytes: entry.isFile() ? statSync(fullPath).size : undefined,
      });
    }

    return artifacts;
  }

  cleanup(workspace: IsolatedWorkspace) {
    if (existsSync(workspace.baseDir)) {
      rmSync(workspace.baseDir, { recursive: true, force: true });
    }
  }
}
