/**
 * ░▒▓ SKILL LOADER ▓▒░
 *
 * "I know kung fu."
 *
 * Parses SKILL.md files with YAML frontmatter and extracts
 * the markdown body as executable instructions.
 */

import type { Skill } from '@neo-agent/shared';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { parseFrontmatter } from '../utils/frontmatter.js';

export class SkillLoader {
  parse(skillMdPath: string): Skill {
    const raw = readFileSync(skillMdPath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(raw);

    return {
      name: frontmatter.name ?? basename(dirname(skillMdPath)),
      description: frontmatter.description ?? '',
      tags: frontmatter.tags ?? [],
      instructions: body.trim(),
      path: dirname(skillMdPath),
      scripts: this.scanDir(dirname(skillMdPath), 'scripts'),
      examples: this.scanDir(dirname(skillMdPath), 'examples'),
    };
  }

  private scanDir(skillDir: string, subdir: string): string[] {
    const dir = join(skillDir, subdir);
    if (!existsSync(dir)) return [];
    return readdirSync(dir);
  }
}
