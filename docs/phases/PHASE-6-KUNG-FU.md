# Phase 6 — Kung Fu Downloads (Skills + Acquisition)

> _"I know kung fu." / "Show me."_

**Goal**: Build the skill system (SKILL.md folder scanner, registry, execution context) and proactive skill acquisition via Firecrawl.

**Estimated time**: 4-6 hours
**Prerequisites**: Phase 3 complete (Firecrawl integration, Cron scheduler)

---

## 6.1 — Skill Registry

### `server/src/skills/registry.ts`

```typescript
export class SkillRegistry {
  private skills = new Map<string, Skill>();

  async loadFromDirectory(skillsDir: string) {
    const folders = readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory());

    for (const folder of folders) {
      const skillMdPath = join(skillsDir, folder.name, 'SKILL.md');
      if (existsSync(skillMdPath)) {
        const skill = await this.loader.parse(skillMdPath);
        this.skills.set(skill.name, skill);
      }
    }
  }

  getAll(): Skill[] {
    return Array.from(this.skills.values());
  }
  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }
}
```

---

## 6.2 — SKILL.md Parser

### `server/src/skills/loader.ts`

```typescript
export class SkillLoader {
  async parse(skillMdPath: string): Promise<Skill> {
    const raw = readFileSync(skillMdPath, 'utf-8');
    const { frontmatter, body } = this.parseFrontmatter(raw);

    return {
      name: frontmatter.name ?? basename(dirname(skillMdPath)),
      description: frontmatter.description ?? '',
      tags: frontmatter.tags ?? [],
      instructions: body,
      path: dirname(skillMdPath),
      scripts: this.scanScripts(dirname(skillMdPath)),
      examples: this.scanExamples(dirname(skillMdPath)),
    };
  }

  private scanScripts(dir: string): string[] {
    const scriptsDir = join(dir, 'scripts');
    if (!existsSync(scriptsDir)) return [];
    return readdirSync(scriptsDir);
  }
}
```

---

## 6.3 — Proactive Skill Acquisition

### `server/src/skills/acquisition.ts`

Uses Firecrawl + Cron to proactively learn from the web:

```typescript
export class SkillAcquisition {
  constructor(
    private crawler: CrawlerTool,
    private scheduler: SchedulerTool,
    private registry: SkillRegistry,
  ) {}

  startSchedule(cronExpr = '0 3 * * *') {
    // 3am daily
    this.scheduler.schedule('skill-acquisition', cronExpr, () => this.run());
  }

  async run() {
    // Check for new skill sources (configured URLs, trending repos, etc.)
    const sources = await this.getSkillSources();
    for (const source of sources) {
      try {
        const markdown = await this.crawler.scrapeToMarkdown(source.url);
        await this.createSkillFromMarkdown(source.name, markdown);
      } catch (err) {
        console.warn(`Failed to acquire skill from ${source.url}:`, err);
      }
    }
  }

  private async createSkillFromMarkdown(name: string, content: string) {
    const skillDir = join(this.skillsDir, name);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      [
        '---',
        `name: ${name}`,
        `description: Auto-acquired skill`,
        `tags: [acquired, auto]`,
        '---',
        '',
        content,
      ].join('\n'),
    );
    await this.registry.loadFromDirectory(this.skillsDir);
  }
}
```

---

## 6.4 — Skill Execution Context

### `server/src/skills/executor.ts`

When a skill is relevant to the current task, inject its context into the system prompt:

```typescript
export class SkillExecutor {
  getActiveContexts(query: string, maxSkills = 2): string[] {
    const allSkills = this.registry.getAll();
    return allSkills
      .filter((s) => this.isRelevant(s, query))
      .slice(0, maxSkills)
      .map((s) => `## Skill: ${s.name}\n${s.instructions}`);
  }

  private isRelevant(skill: Skill, query: string): boolean {
    const queryLower = query.toLowerCase();
    return (
      skill.tags.some((t) => queryLower.includes(t.toLowerCase())) ||
      queryLower.includes(skill.name.toLowerCase())
    );
  }
}
```

---

## Test Suite

### `server/tests/phase-6/skill-loader.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { SkillLoader } from '../../src/skills/loader';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('SkillLoader', () => {
  const loader = new SkillLoader();
  const tmpDir = join(__dirname, '__tmp_skill__');

  beforeEach(() => {
    mkdirSync(join(tmpDir, 'scripts'), { recursive: true });
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

  it('parses frontmatter name', async () => {
    const skill = await loader.parse(join(tmpDir, 'SKILL.md'));
    expect(skill.name).toBe('test-skill');
  });

  it('parses frontmatter description', async () => {
    const skill = await loader.parse(join(tmpDir, 'SKILL.md'));
    expect(skill.description).toBe('A test skill');
  });

  it('parses frontmatter tags', async () => {
    const skill = await loader.parse(join(tmpDir, 'SKILL.md'));
    expect(skill.tags).toEqual(['testing', 'vitest']);
  });

  it('extracts markdown body as instructions', async () => {
    const skill = await loader.parse(join(tmpDir, 'SKILL.md'));
    expect(skill.instructions).toContain('# Test Skill');
    expect(skill.instructions).toContain('This skill does testing.');
  });

  it('scans scripts/ subdirectory', async () => {
    writeFileSync(join(tmpDir, 'scripts', 'run.sh'), '#!/bin/bash\necho hello');
    const skill = await loader.parse(join(tmpDir, 'SKILL.md'));
    expect(skill.scripts).toContain('run.sh');
  });

  it('returns empty scripts when scripts/ does not exist', async () => {
    const bareDir = join(__dirname, '__tmp_bare_skill__');
    mkdirSync(bareDir, { recursive: true });
    writeFileSync(join(bareDir, 'SKILL.md'), '---\nname: bare\n---\nHello');
    const skill = await loader.parse(join(bareDir, 'SKILL.md'));
    expect(skill.scripts).toEqual([]);
  });

  it('falls back to directory name when name not in frontmatter', async () => {
    const noName = join(__dirname, '__tmp_noname__');
    mkdirSync(noName, { recursive: true });
    writeFileSync(join(noName, 'SKILL.md'), '---\ndescription: no name\n---\nContent');
    const skill = await loader.parse(join(noName, 'SKILL.md'));
    expect(skill.name).toBe('__tmp_noname__');
  });
});
```

### `server/tests/phase-6/skill-registry.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { SkillRegistry } from '../../src/skills/registry';

describe('SkillRegistry', () => {
  let registry: SkillRegistry;

  beforeEach(async () => {
    registry = new SkillRegistry();
    await registry.loadFromDirectory(join(__dirname, '__fixtures__', 'skills'));
  });

  it('loads all skills from directory', () => {
    expect(registry.getAll().length).toBeGreaterThan(0);
  });

  it('retrieves a specific skill by name', () => {
    const skill = registry.get('test-skill');
    expect(skill).toBeDefined();
    expect(skill?.name).toBe('test-skill');
  });

  it('returns undefined for non-existent skill', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('ignores directories without SKILL.md', async () => {
    // Create a dir without SKILL.md
    const emptyDir = join(__dirname, '__fixtures__', 'skills', 'no-skill-md');
    mkdirSync(emptyDir, { recursive: true });
    const freshRegistry = new SkillRegistry();
    await freshRegistry.loadFromDirectory(join(__dirname, '__fixtures__', 'skills'));
    expect(freshRegistry.get('no-skill-md')).toBeUndefined();
  });
});
```

### `server/tests/phase-6/skill-executor.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { SkillExecutor } from '../../src/skills/executor';

describe('SkillExecutor', () => {
  const executor = new SkillExecutor(mockRegistry);

  it('returns relevant skills matching query keywords', () => {
    const contexts = executor.getActiveContexts('help me with testing');
    expect(contexts.length).toBeGreaterThan(0);
    expect(contexts[0]).toContain('Skill:');
  });

  it('returns empty array when no skills match', () => {
    const contexts = executor.getActiveContexts('completely unrelated quantum physics');
    expect(contexts).toHaveLength(0);
  });

  it('limits to maxSkills parameter', () => {
    const contexts = executor.getActiveContexts('testing deployment debugging', 1);
    expect(contexts.length).toBeLessThanOrEqual(1);
  });

  it('matches by tag name', () => {
    // Assuming a skill tagged with 'vitest'
    const contexts = executor.getActiveContexts('vitest setup');
    expect(contexts.length).toBeGreaterThan(0);
  });

  it('matches by skill name', () => {
    const contexts = executor.getActiveContexts('test-skill usage');
    expect(contexts.length).toBeGreaterThan(0);
  });

  it('formats context as markdown with skill name header', () => {
    const contexts = executor.getActiveContexts('testing');
    if (contexts.length > 0) {
      expect(contexts[0]).toMatch(/^## Skill: /);
    }
  });
});
```

---

## Acceptance Criteria

- [ ] SKILL.md files parsed with frontmatter (name, description, tags)
- [ ] Skills auto-discovered from `workspace/skills/` directories
- [ ] Skill browser shows all installed skills with metadata
- [ ] Proactive acquisition scrapes URLs and creates SKILL.md files
- [ ] Relevant skills injected into system prompt context
- [ ] Scheduled acquisition runs via Cron

---

## Files Created

```
server/src/skills/
├── registry.ts        ← NEW
├── loader.ts          ← NEW
├── executor.ts        ← NEW
└── acquisition.ts     ← NEW
```
