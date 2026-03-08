import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SkillRegistry } from '../../src/skills/registry';

describe('SkillRegistry', () => {
  const fixtureDir = join(__dirname, '__tmp_registry__');
  let registry: SkillRegistry;

  beforeEach(() => {
    // Create two skill directories
    mkdirSync(join(fixtureDir, 'skill-a'), { recursive: true });
    writeFileSync(
      join(fixtureDir, 'skill-a', 'SKILL.md'),
      '---\nname: skill-a\ndescription: Skill A\ntags: [alpha]\n---\n# Skill A',
    );

    mkdirSync(join(fixtureDir, 'skill-b'), { recursive: true });
    writeFileSync(
      join(fixtureDir, 'skill-b', 'SKILL.md'),
      '---\nname: skill-b\ndescription: Skill B\ntags: [beta]\n---\n# Skill B',
    );

    // Directory without SKILL.md
    mkdirSync(join(fixtureDir, 'no-skill-md'), { recursive: true });

    registry = new SkillRegistry();
    registry.loadFromDirectory(fixtureDir);
  });

  afterEach(() => {
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  it('loads all skills from directory', () => {
    expect(registry.getAll()).toHaveLength(2);
  });

  it('retrieves a specific skill by name', () => {
    const skill = registry.get('skill-a');
    expect(skill).toBeDefined();
    expect(skill?.name).toBe('skill-a');
  });

  it('returns undefined for non-existent skill', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('ignores directories without SKILL.md', () => {
    expect(registry.get('no-skill-md')).toBeUndefined();
  });

  it('reload clears and reloads skills', () => {
    registry.reload(fixtureDir);
    expect(registry.getAll()).toHaveLength(2);
  });

  it('reports correct size', () => {
    expect(registry.size).toBe(2);
  });

  it('has() returns true for existing skills', () => {
    expect(registry.has('skill-a')).toBe(true);
    expect(registry.has('nonexistent')).toBe(false);
  });
});
