/**
 * ░▒▓ AGENT REGISTRY ▓▒░
 *
 * "You hear that, Mr. Anderson? That is the sound of inevitability."
 *
 * Blueprint CRUD + directory scanning for AGENT.md files.
 * Follows the same YAML frontmatter + directory scan convention
 * as the Skill System (Phase 6).
 */

import type { AgentBlueprint } from '@neo-agent/shared';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { parseFrontmatter } from '../utils/frontmatter.js';

export class AgentRegistry {
  private blueprints = new Map<string, AgentBlueprint>();

  register(blueprint: AgentBlueprint) {
    this.blueprints.set(blueprint.name, blueprint);
  }

  get(name: string): AgentBlueprint | undefined {
    return this.blueprints.get(name);
  }

  getAll(): AgentBlueprint[] {
    return Array.from(this.blueprints.values());
  }

  has(name: string): boolean {
    return this.blueprints.has(name);
  }

  get size(): number {
    return this.blueprints.size;
  }

  /**
   * Scan for AGENT.md frontmatter files in a directory.
   * Same convention as SkillLoader (Phase 6).
   */
  loadFromDirectory(agentsDir: string) {
    if (!existsSync(agentsDir)) return;

    const folders = readdirSync(agentsDir, { withFileTypes: true }).filter((d) => d.isDirectory());

    for (const folder of folders) {
      const agentMdPath = join(agentsDir, folder.name, 'AGENT.md');
      if (existsSync(agentMdPath)) {
        const blueprint = this.parseAgentMd(agentMdPath);
        this.register(blueprint);
      }
    }
  }

  reload(agentsDir: string) {
    this.blueprints.clear();
    this.loadFromDirectory(agentsDir);
  }

  private parseAgentMd(path: string): AgentBlueprint {
    const raw = readFileSync(path, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(raw);
    const dirName = basename(dirname(path));

    // allowedTools is already parsed as an array by parseFrontmatter
    const allowedTools: string[] | undefined = Array.isArray(frontmatter.allowedTools)
      ? frontmatter.allowedTools
      : undefined;

    // Read companion CLAUDE.md if present
    const claudeMdPath = join(dirname(path), 'CLAUDE.md');
    const claudeMd = existsSync(claudeMdPath) ? readFileSync(claudeMdPath, 'utf-8') : undefined;

    return {
      name: frontmatter.name ?? dirName,
      description: frontmatter.description ?? '',
      systemPrompt: body.trim(),
      allowedTools,
      maxTurns: frontmatter.maxTurns ? Number(frontmatter.maxTurns) : undefined,
      timeoutMs: frontmatter.timeoutMs ? Number(frontmatter.timeoutMs) : undefined,
      model: (frontmatter.model as AgentBlueprint['model']) ?? undefined,
      claudeMd,
    };
  }
}
