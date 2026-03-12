/**
 * ░▒▓ SKILL REGISTRY ▓▒░
 *
 * "Show me."
 *
 * Scans a directory for skill folders containing SKILL.md files.
 * Provides lookup, listing, and idempotent reload.
 */

import type { Skill } from '@neo-agent/shared';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { SkillLoader } from './loader.js';

export class SkillRegistry {
  private skills = new Map<string, Skill>();
  private loader = new SkillLoader();

  loadFromDirectory(skillsDir: string) {
    if (!existsSync(skillsDir)) return;

    const folders = readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory());

    for (const folder of folders) {
      const skillMdPath = join(skillsDir, folder.name, 'SKILL.md');
      if (existsSync(skillMdPath)) {
        const skill = this.loader.parse(skillMdPath);
        this.skills.set(skill.name, skill);
      }
    }
  }

  reload(skillsDir: string) {
    this.skills.clear();
    this.loadFromDirectory(skillsDir);
  }

  getAll(): Skill[] {
    return Array.from(this.skills.values());
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  has(name: string): boolean {
    return this.skills.has(name);
  }

  remove(name: string): boolean {
    return this.skills.delete(name);
  }

  get size(): number {
    return this.skills.size;
  }
}
