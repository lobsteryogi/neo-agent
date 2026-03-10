/**
 * ░▒▓ SKILL LEARNER ▓▒░
 *
 * "Tank, I need a pilot program for a B-212 helicopter."
 *
 * Acquires new skills on demand from two sources:
 * 1. ClawHub.ai — vector-search skill registry (3,000+ community skills)
 * 2. Manual — create SKILL.md from provided content
 */

import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ensureDir } from '../utils/fs.js';
import type { ClawHubSkillMeta } from './clawhub.js';
import { ClawHubClient } from './clawhub.js';
import type { SkillRegistry } from './registry.js';

export interface LearnOptions {
  name: string;
  description?: string;
  tags?: string[];
  content: string;
}

export class SkillLearner {
  private clawhub: ClawHubClient;

  constructor(
    private skillsDir: string,
    private registry: SkillRegistry,
  ) {
    this.clawhub = new ClawHubClient();
  }

  /**
   * Search ClawHub.ai for skills using semantic vector search.
   */
  async search(query: string, limit = 5): Promise<ClawHubSkillMeta[]> {
    return this.clawhub.search(query, limit);
  }

  /**
   * Install a skill from ClawHub by slug.
   * Downloads the bundle and writes SKILL.md + supporting files.
   */
  async install(slug: string): Promise<string> {
    const skillDir = join(this.skillsDir, slug);

    if (existsSync(skillDir)) {
      throw new Error(`Skill "${slug}" already exists at ${skillDir}`);
    }

    const bundle = await this.clawhub.download(slug);
    if (!bundle) {
      throw new Error(`Skill "${slug}" not found on ClawHub`);
    }

    ensureDir(skillDir);

    for (const file of bundle.files) {
      const filePath = join(skillDir, file.name);
      const fileDir = join(skillDir, ...file.name.split('/').slice(0, -1));
      if (fileDir !== skillDir) {
        ensureDir(fileDir);
      }
      writeFileSync(filePath, file.content);
    }

    // Reload registry to pick up the new skill
    this.registry.reload(this.skillsDir);

    return skillDir;
  }

  /**
   * Create a skill manually from provided content.
   */
  learn(opts: LearnOptions): string {
    const skillDir = join(this.skillsDir, opts.name);

    if (existsSync(skillDir)) {
      throw new Error(`Skill "${opts.name}" already exists at ${skillDir}`);
    }

    ensureDir(skillDir);

    const tags = opts.tags ?? ['acquired', 'auto'];
    const frontmatter = [
      '---',
      `name: ${opts.name}`,
      `description: ${opts.description ?? 'Auto-acquired skill'}`,
      `tags: [${tags.join(', ')}]`,
      '---',
    ].join('\n');

    writeFileSync(join(skillDir, 'SKILL.md'), `${frontmatter}\n\n${opts.content}`);

    // Reload registry to pick up the new skill
    this.registry.reload(this.skillsDir);

    return skillDir;
  }

  hasSkill(name: string): boolean {
    return existsSync(join(this.skillsDir, name, 'SKILL.md'));
  }
}
