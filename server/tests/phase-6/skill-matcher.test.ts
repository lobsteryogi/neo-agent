import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SkillMatcher } from '../../src/skills/matcher';
import { SkillRegistry } from '../../src/skills/registry';

describe('SkillMatcher', () => {
  const fixtureDir = join(__dirname, '__tmp_matcher__');
  let matcher: SkillMatcher;

  beforeEach(() => {
    mkdirSync(join(fixtureDir, 'typescript-patterns'), { recursive: true });
    writeFileSync(
      join(fixtureDir, 'typescript-patterns', 'SKILL.md'),
      '---\nname: typescript-patterns\ndescription: TS patterns\ntags: [typescript, ts, patterns]\n---\n# TypeScript Patterns\n\nUse generics wisely.',
    );

    mkdirSync(join(fixtureDir, 'react-hooks'), { recursive: true });
    writeFileSync(
      join(fixtureDir, 'react-hooks', 'SKILL.md'),
      '---\nname: react-hooks\ndescription: React hook patterns\ntags: [react, hooks]\n---\n# React Hooks\n\nUseEffect cleanup.',
    );

    const registry = new SkillRegistry();
    registry.loadFromDirectory(fixtureDir);
    matcher = new SkillMatcher(registry);
  });

  afterEach(() => {
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  it('matches skills by tag keyword', () => {
    const contexts = matcher.getActiveContexts('help me with typescript generics');
    expect(contexts.length).toBeGreaterThan(0);
    expect(contexts[0]).toContain('TypeScript Patterns');
  });

  it('matches skills by name', () => {
    const contexts = matcher.getActiveContexts('react-hooks usage');
    expect(contexts.length).toBeGreaterThan(0);
    expect(contexts[0]).toContain('React Hooks');
  });

  it('returns empty array when no skills match', () => {
    const contexts = matcher.getActiveContexts('quantum physics simulation');
    expect(contexts).toHaveLength(0);
  });

  it('limits to maxSkills parameter', () => {
    const contexts = matcher.getActiveContexts('typescript react patterns hooks', 1);
    expect(contexts.length).toBeLessThanOrEqual(1);
  });

  it('formats context as markdown with skill name header', () => {
    const contexts = matcher.getActiveContexts('typescript');
    expect(contexts.length).toBeGreaterThan(0);
    expect(contexts[0]).toMatch(/^## Skill: /);
  });

  it('findRelevant returns raw Skill objects', () => {
    const skills = matcher.findRelevant('typescript');
    expect(skills.length).toBeGreaterThan(0);
    expect(skills[0]).toHaveProperty('name');
    expect(skills[0]).toHaveProperty('instructions');
  });
});
