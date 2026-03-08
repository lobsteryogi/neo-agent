import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SkillLoader } from '../../src/skills/loader';

describe('SkillLoader', () => {
  const loader = new SkillLoader();
  const tmpDir = join(__dirname, '__tmp_skill__');

  beforeEach(() => {
    mkdirSync(join(tmpDir, 'scripts'), { recursive: true });
    mkdirSync(join(tmpDir, 'examples'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'SKILL.md'),
      [
        '---',
        'name: test-skill',
        'description: A test skill',
        'tags: [testing, vitest]',
        '---',
        '',
        '# Test Skill',
        '',
        'This skill does testing.',
      ].join('\n'),
    );
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses frontmatter name', () => {
    const skill = loader.parse(join(tmpDir, 'SKILL.md'));
    expect(skill.name).toBe('test-skill');
  });

  it('parses frontmatter description', () => {
    const skill = loader.parse(join(tmpDir, 'SKILL.md'));
    expect(skill.description).toBe('A test skill');
  });

  it('parses frontmatter tags', () => {
    const skill = loader.parse(join(tmpDir, 'SKILL.md'));
    expect(skill.tags).toEqual(['testing', 'vitest']);
  });

  it('extracts markdown body as instructions', () => {
    const skill = loader.parse(join(tmpDir, 'SKILL.md'));
    expect(skill.instructions).toContain('# Test Skill');
    expect(skill.instructions).toContain('This skill does testing.');
  });

  it('scans scripts/ subdirectory', () => {
    writeFileSync(join(tmpDir, 'scripts', 'run.sh'), '#!/bin/bash\necho hello');
    const skill = loader.parse(join(tmpDir, 'SKILL.md'));
    expect(skill.scripts).toContain('run.sh');
  });

  it('scans examples/ subdirectory', () => {
    writeFileSync(join(tmpDir, 'examples', 'demo.ts'), 'console.log("demo")');
    const skill = loader.parse(join(tmpDir, 'SKILL.md'));
    expect(skill.examples).toContain('demo.ts');
  });

  it('returns empty arrays when subdirectories do not exist', () => {
    const bareDir = join(__dirname, '__tmp_bare__');
    mkdirSync(bareDir, { recursive: true });
    writeFileSync(join(bareDir, 'SKILL.md'), '---\nname: bare\n---\nHello');
    const skill = loader.parse(join(bareDir, 'SKILL.md'));
    expect(skill.scripts).toEqual([]);
    expect(skill.examples).toEqual([]);
    rmSync(bareDir, { recursive: true, force: true });
  });

  it('falls back to directory name when name not in frontmatter', () => {
    const noName = join(__dirname, '__tmp_noname__');
    mkdirSync(noName, { recursive: true });
    writeFileSync(join(noName, 'SKILL.md'), '---\ndescription: no name\n---\nContent');
    const skill = loader.parse(join(noName, 'SKILL.md'));
    expect(skill.name).toBe('__tmp_noname__');
    rmSync(noName, { recursive: true, force: true });
  });
});
