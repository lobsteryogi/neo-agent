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

export class SkillLoader {
  parse(skillMdPath: string): Skill {
    const raw = readFileSync(skillMdPath, 'utf-8');
    const { frontmatter, body } = this.parseFrontmatter(raw);

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

  private parseFrontmatter(raw: string): { frontmatter: Record<string, any>; body: string } {
    const fenceRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = raw.match(fenceRegex);

    if (!match) return { frontmatter: {}, body: raw };

    const frontmatter: Record<string, any> = {};
    for (const line of match[1].split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      if (!key) continue;

      // Parse YAML arrays: [tag1, tag2]
      if (value.startsWith('[') && value.endsWith(']')) {
        frontmatter[key] = value
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        frontmatter[key] = value;
      }
    }

    return { frontmatter, body: match[2] };
  }

  private scanDir(skillDir: string, subdir: string): string[] {
    const dir = join(skillDir, subdir);
    if (!existsSync(dir)) return [];
    return readdirSync(dir);
  }
}
