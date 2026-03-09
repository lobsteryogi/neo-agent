# Phase 6 — Kung Fu Downloads (Skill System)

> _"I know kung fu." / "Show me."_

**Goal**: Build a skill calling & learning system — scan `SKILL.md` files from disk, register them into a queryable catalog, match relevant skills to user messages for system prompt injection, support on-demand skill acquisition, and discover community skills via ClawHub.ai.

**Estimated time**: 4-6 hours
**Prerequisites**: Phase 1 complete (agent loop, Claude Bridge)

---

## 6.1 — Skill Loader

### `server/src/skills/loader.ts`

Parses a `SKILL.md` file with YAML frontmatter and extracts the markdown body as executable instructions. Scans for companion `scripts/` and `examples/` subdirectories.

```typescript
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
```

---

## 6.2 — Skill Registry

### `server/src/skills/registry.ts`

Scans a directory for skill folders containing `SKILL.md` files. Provides lookup, listing, and idempotent reload.

```typescript
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
    return this.findRelevant(query, maxSkills).map(
      (s) => `## Skill: ${s.name}\n\n${s.instructions}`,
    );
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

Acquires new skills from two sources:

1. **ClawHub.ai** — vector-search skill registry (3,000+ community skills)
2. **Manual** — create `SKILL.md` from provided content

```typescript
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ClawHubSkillMeta } from './clawhub.js';
import { ClawHubClient } from './clawhub.js';
import type { SkillRegistry } from './registry.js';

export interface LearnOptions {
  name: string;
  description?: string;
  tags?: string[];
  content: string;
}

export class SkillLearner {
  private clawhub: ClawHubClient;

  constructor(
    private skillsDir: string,
    private registry: SkillRegistry,
  ) {
    this.clawhub = new ClawHubClient();
  }

  /** Search ClawHub.ai for skills using semantic vector search. */
  async search(query: string, limit = 5): Promise<ClawHubSkillMeta[]> {
    return this.clawhub.search(query, limit);
  }

  /** Install a skill from ClawHub by slug. Downloads the bundle and writes SKILL.md + supporting files. */
  async install(slug: string): Promise<string> {
    const skillDir = join(this.skillsDir, slug);

    if (existsSync(skillDir)) {
      throw new Error(`Skill "${slug}" already exists at ${skillDir}`);
    }

    const bundle = await this.clawhub.download(slug);
    if (!bundle) {
      throw new Error(`Skill "${slug}" not found on ClawHub`);
    }

    mkdirSync(skillDir, { recursive: true });

    for (const file of bundle.files) {
      const filePath = join(skillDir, file.name);
      const fileDir = join(skillDir, ...file.name.split('/').slice(0, -1));
      if (fileDir !== skillDir) {
        mkdirSync(fileDir, { recursive: true });
      }
      writeFileSync(filePath, file.content);
    }

    this.registry.reload(this.skillsDir);
    return skillDir;
  }

  /** Create a skill manually from provided content. */
  learn(opts: LearnOptions): string {
    const skillDir = join(this.skillsDir, opts.name);

    if (existsSync(skillDir)) {
      throw new Error(`Skill "${opts.name}" already exists at ${skillDir}`);
    }

    mkdirSync(skillDir, { recursive: true });

    const tags = opts.tags ?? ['acquired', 'auto'];
    const frontmatter = [
      '---',
      `name: ${opts.name}`,
      `description: ${opts.description ?? 'Auto-acquired skill'}`,
      `tags: [${tags.join(', ')}]`,
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

## 6.5 — ClawHub Client

### `server/src/skills/clawhub.ts`

Client for [ClawHub.ai](https://clawhub.ai) — the skill registry for agents. Provides vector-search skill discovery from 3,000+ community skills, metadata lookup, and bundle download.

```typescript
const CLAWHUB_BASE = 'https://clawhub.ai/api/v1';

export interface ClawHubSkillMeta {
  slug: string;
  name: string;
  description: string;
  version: string;
  tags?: string[];
}

export interface ClawHubSearchResult {
  results: ClawHubSkillMeta[];
  total: number;
}

export interface ClawHubSkillBundle {
  slug: string;
  files: { name: string; content: string }[];
}

export class ClawHubClient {
  private baseUrl: string;

  constructor(baseUrl = CLAWHUB_BASE) {
    this.baseUrl = baseUrl;
  }

  /** Semantic vector search for skills on ClawHub. */
  async search(query: string, limit = 5): Promise<ClawHubSkillMeta[]> {
    const url = `${this.baseUrl}/search?q=${encodeURIComponent(query)}&limit=${limit}`;
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`ClawHub search failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as ClawHubSearchResult;
    return data.results ?? [];
  }

  /** Get full metadata for a specific skill by slug. */
  async getSkill(slug: string): Promise<ClawHubSkillMeta | null> {
    const url = `${this.baseUrl}/skills/${encodeURIComponent(slug)}`;
    const res = await fetch(url);

    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`ClawHub getSkill failed: ${res.status} ${res.statusText}`);
    }

    return (await res.json()) as ClawHubSkillMeta;
  }

  /** Download a skill bundle (SKILL.md + supporting files) as JSON. */
  async download(slug: string): Promise<ClawHubSkillBundle | null> {
    const url = `${this.baseUrl}/download?slug=${encodeURIComponent(slug)}`;
    const res = await fetch(url);

    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`ClawHub download failed: ${res.status} ${res.statusText}`);
    }

    return (await res.json()) as ClawHubSkillBundle;
  }

  /** Get raw file content from a skill. */
  async getFile(slug: string, path: string): Promise<string | null> {
    const url = `${this.baseUrl}/skills/${encodeURIComponent(slug)}/file?path=${encodeURIComponent(path)}`;
    const res = await fetch(url);

    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`ClawHub getFile failed: ${res.status} ${res.statusText}`);
    }

    return res.text();
  }
}
```

---

## 6.6 — Integration with Agent Loop

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
  it('parses frontmatter name');
  it('parses frontmatter description');
  it('parses frontmatter tags');
  it('extracts markdown body as instructions');
  it('scans scripts/ subdirectory');
  it('scans examples/ subdirectory');
  it('returns empty arrays when subdirectories do not exist');
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
  it('has() returns true for existing skills');
});
```

### `server/tests/phase-6/skill-matcher.test.ts`

```typescript
describe('SkillMatcher', () => {
  it('matches skills by tag keyword');
  it('matches skills by name');
  it('returns empty array when no skills match');
  it('limits to maxSkills parameter');
  it('formats context as markdown with skill name header');
  it('findRelevant returns raw Skill objects');
});
```

### `server/tests/phase-6/skill-learner.test.ts`

```typescript
describe('SkillLearner', () => {
  it('creates SKILL.md with frontmatter and content');
  it('reloads registry after learning');
  it('throws if skill already exists');
  it('uses default tags when not provided');
  it('hasSkill returns true for existing skills');
  it('hasSkill returns false for non-existent skills');
});
```

---

## Acceptance Criteria

- [x] `SKILL.md` files parsed with frontmatter (name, description, tags)
- [x] Skills auto-discovered from `workspace/skills/` directories
- [x] `SkillMatcher` finds and injects relevant skills into system prompt
- [x] `SkillLearner` creates new `SKILL.md` files on demand
- [x] `SkillLearner.search()` queries ClawHub for community skills
- [x] `SkillLearner.install()` downloads and installs ClawHub bundles
- [x] `/api/skills` lists all installed skills
- [x] `/api/skills/:name` returns full skill details
- [x] Agent system prompt enriched with matching skill contexts
- [x] ClawHub client handles search, metadata, download, and file retrieval

---

## Files Created

```text
server/src/skills/
├── index.ts           ← barrel export
├── loader.ts          ← SKILL.md parser
├── registry.ts        ← directory scanner
├── matcher.ts         ← query-based matching
├── learner.ts         ← on-demand acquisition (manual + ClawHub)
└── clawhub.ts         ← ClawHub.ai API client
```
