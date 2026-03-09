import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SkillLearner } from '../../src/skills/learner';
import { SkillRegistry } from '../../src/skills/registry';

describe('SkillLearner', () => {
  const fixtureDir = join(__dirname, '__tmp_learner__');
  let registry: SkillRegistry;
  let learner: SkillLearner;

  beforeEach(() => {
    mkdirSync(fixtureDir, { recursive: true });
    registry = new SkillRegistry();
    learner = new SkillLearner(fixtureDir, registry);
  });

  afterEach(() => {
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  it('creates SKILL.md with frontmatter and content', () => {
    learner.learn({
      name: 'test-skill',
      description: 'A test skill',
      tags: ['testing', 'vitest'],
      content: '# Test\n\nDo testing things.',
    });

    const skillMd = readFileSync(join(fixtureDir, 'test-skill', 'SKILL.md'), 'utf-8');
    expect(skillMd).toContain('name: test-skill');
    expect(skillMd).toContain('description: A test skill');
    expect(skillMd).toContain('tags: [testing, vitest]');
    expect(skillMd).toContain('# Test');
    expect(skillMd).toContain('Do testing things.');
  });

  it('reloads registry after learning', () => {
    expect(registry.size).toBe(0);

    learner.learn({
      name: 'new-skill',
      content: 'Instructions here.',
    });

    expect(registry.size).toBe(1);
    expect(registry.has('new-skill')).toBe(true);
  });

  it('throws if skill already exists', () => {
    learner.learn({ name: 'dupe-skill', content: 'First version.' });

    expect(() => {
      learner.learn({ name: 'dupe-skill', content: 'Second version.' });
    }).toThrow('already exists');
  });

  it('uses default tags when not provided', () => {
    learner.learn({ name: 'defaults', content: 'Content.' });

    const skillMd = readFileSync(join(fixtureDir, 'defaults', 'SKILL.md'), 'utf-8');
    expect(skillMd).toContain('tags: [acquired, auto]');
  });

  it('hasSkill returns true for existing skills', () => {
    learner.learn({ name: 'exists', content: 'Content.' });
    expect(learner.hasSkill('exists')).toBe(true);
  });

  it('hasSkill returns false for non-existent skills', () => {
    expect(learner.hasSkill('ghost')).toBe(false);
  });
});
