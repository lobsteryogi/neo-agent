/**
 * ░▒▓ SKILL MATCHER ▓▒░
 *
 * "Guns. Lots of guns."
 *
 * Matches relevant skills to a user query based on tag and name
 * keyword matching. Returns formatted context blocks for system prompt injection.
 */

import type { Skill } from '@neo-agent/shared';
import type { SkillRegistry } from './registry.js';

export class SkillMatcher {
  constructor(private registry: SkillRegistry) {}

  /**
   * Find skills relevant to the query and format them as system prompt context.
   */
  getActiveContexts(query: string, maxSkills = 2): string[] {
    return this.findRelevant(query, maxSkills).map(
      (s) => `## Skill: ${s.name}\n\n${s.instructions}`,
    );
  }

  /**
   * Get raw matching skills (without formatting).
   */
  findRelevant(query: string, maxSkills = 2): Skill[] {
    return this.registry
      .getAll()
      .filter((s) => this.isRelevant(s, query))
      .slice(0, maxSkills);
  }

  private isRelevant(skill: Skill, query: string): boolean {
    const q = query.toLowerCase();
    return (
      skill.tags.some((t) => q.includes(t.toLowerCase())) || q.includes(skill.name.toLowerCase())
    );
  }
}
