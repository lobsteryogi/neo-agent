# Phase 6 — Kung Fu Downloads (Skill System)

> _"I know kung fu." / "Show me."_

**Goal**: Build a skill calling & learning system — scan `SKILL.md` files from disk, register them into a queryable catalog, match relevant skills to user messages for system prompt injection, and support on-demand skill acquisition.

**Estimated time**: 4-6 hours
**Prerequisites**: Phase 1 complete (agent loop, Claude Bridge)

---

## 6.1 — Skill Loader

### `server/src/skills/loader.ts`

Parses a `SKILL.md` file with YAML frontmatter and extracts the markdown body as executable instructions. Scans for companion `scripts/` and `examples/` subdirectories.

```typescript
import { existsSync, readdirSync, readFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import type { Skill } from '@neo-agent/shared';

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
      const [key, ...rest] = line.split(':');
      if (!key?.trim()) continue;
      const value = rest.join(':').trim();

      if (value.startsWith('[') && value.endsWith(']')) {
        frontmatter[key.trim()] = value
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim());
      } else {
        frontmatter[key.trim()] = value;
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
```

---

## 6.2 — Skill Registry

### `server/src/skills/registry.ts`

Scans a directory for skill folders containing `SKILL.md` files. Provides lookup, listing, and idempotent reload.

```typescript
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import type { Skill } from '@neo-agent/shared';
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
  get size(): number {
    return this.skills.size;
  }
}
```

---

## 6.3 — Skill Matcher

### `server/src/skills/matcher.ts`

Matches relevant skills to a user query based on tag and name keyword matching. Returns formatted context blocks ready for system prompt injection.

```typescript
import type { Skill } from '@neo-agent/shared';
import type { SkillRegistry } from './registry.js';

export class SkillMatcher {
  constructor(private registry: SkillRegistry) {}

  /** Find skills relevant to the query and format as system prompt context. */
  getActiveContexts(query: string, maxSkills = 2): string[] {
    return this.registry
      .getAll()
      .filter((s) => this.isRelevant(s, query))
      .slice(0, maxSkills)
      .map((s) => `## Skill: ${s.name}\n\n${s.instructions}`);
  }

  /** Get raw matching skills (without formatting). */
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
```

---

## 6.4 — Skill Learner

### `server/src/skills/learner.ts`

Acquires new skills on demand. Given a name and markdown content, creates a `SKILL.md` folder and reloads the registry.

```typescript
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { SkillRegistry } from './registry.js';

export interface LearnOptions {
  name: string;
  description?: string;
  tags?: string[];
  content: string;
}

export class SkillLearner {
  constructor(
    private skillsDir: string,
    private registry: SkillRegistry,
  ) {}

  learn(opts: LearnOptions): string {
    const skillDir = join(this.skillsDir, opts.name);
    if (existsSync(skillDir)) {
      throw new Error(`Skill "${opts.name}" already exists at ${skillDir}`);
    }

    mkdirSync(skillDir, { recursive: true });

    const frontmatter = [
      '---',
      `name: ${opts.name}`,
      `description: ${opts.description ?? 'Auto-acquired skill'}`,
      `tags: [${(opts.tags ?? ['acquired', 'auto']).join(', ')}]`,
      '---',
    ].join('\n');

    writeFileSync(join(skillDir, 'SKILL.md'), `${frontmatter}\n\n${opts.content}`);
    this.registry.reload(this.skillsDir);
    return skillDir;
  }

  hasSkill(name: string): boolean {
    return existsSync(join(this.skillsDir, name, 'SKILL.md'));
  }
}
```

---

## 6.5 — Integration with Agent Loop

### Changes to `server/src/core/agent.ts`

The skill system enriches the agent's system prompt with relevant skill instructions — pure prompt augmentation, no new pipeline stage.

```typescript
// In NeoAgent constructor:
import { SkillRegistry } from '../skills/registry.js';
import { SkillMatcher } from '../skills/matcher.js';

this.skillRegistry = new SkillRegistry();
this.skillRegistry.loadFromDirectory(join(config.workspacePath, 'skills'));
this.skillMatcher = new SkillMatcher(this.skillRegistry);

// In buildSystemPrompt(session, query):
private buildSystemPrompt(session: any, query?: string): string {
  const base = `You are ${this.config.agentName}, a personal AI agent...`;
  if (!query) return base;

  const skillContexts = this.skillMatcher.getActiveContexts(query);
  if (skillContexts.length === 0) return base;

  return [base, '', '# Active Skills', '', ...skillContexts].join('\n');
}
```

### API Endpoints — `server/src/index.ts`

```typescript
app.get('/api/skills', (_req, res) => {
  res.json(
    skillRegistry.getAll().map(({ name, description, tags }) => ({ name, description, tags })),
  );
});

app.get('/api/skills/:name', (req, res) => {
  const skill = skillRegistry.get(req.params.name);
  if (!skill) return res.status(404).json({ error: 'Skill not found' });
  res.json(skill);
});
```

---

## Test Suite

### `server/tests/phase-6/skill-loader.test.ts`

```typescript
describe('SkillLoader', () => {
  it('parses frontmatter name, description, and tags');
  it('extracts markdown body as instructions');
  it('scans scripts/ and examples/ subdirectories');
  it('returns empty arrays when subdirs do not exist');
  it('falls back to directory name when name not in frontmatter');
});
```

### `server/tests/phase-6/skill-registry.test.ts`

```typescript
describe('SkillRegistry', () => {
  it('loads all skills from directory');
  it('retrieves a specific skill by name');
  it('returns undefined for non-existent skill');
  it('ignores directories without SKILL.md');
  it('reload clears and reloads skills');
  it('reports correct size');
});
```

### `server/tests/phase-6/skill-matcher.test.ts`

```typescript
describe('SkillMatcher', () => {
  it('matches skills by tag keyword');
  it('matches skills by name');
  it('returns empty array when no skills match');
  it('limits to maxSkills parameter');
  it('formats context with skill name header');
  it('findRelevant returns raw Skill objects');
});
```

---

## Acceptance Criteria

- [ ] `SKILL.md` files parsed with frontmatter (name, description, tags)
- [ ] Skills auto-discovered from `workspace/skills/` directories
- [ ] `SkillMatcher` finds and injects relevant skills into system prompt
- [ ] `SkillLearner` creates new `SKILL.md` files on demand
- [ ] `/api/skills` lists all installed skills
- [ ] `/api/skills/:name` returns full skill details
- [ ] Agent system prompt enriched with matching skill contexts

---

## Files Created

```text
server/src/skills/
├── index.ts           ← NEW (barrel export)
├── loader.ts          ← NEW (SKILL.md parser)
├── registry.ts        ← NEW (directory scanner)
├── matcher.ts         ← NEW (query-based matching)
├── learner.ts         ← NEW (on-demand acquisition)
└── clawhub.ts         ← NEW (ClawHub.ai API client)
```
