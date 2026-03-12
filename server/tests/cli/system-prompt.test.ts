import type Database from 'better-sqlite3';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryDb } from '../../src/db/connection';
import { LongTermMemory } from '../../src/memory/long-term';
import {
  buildSystemPrompt,
  nowWithTz,
  type SystemPromptDeps,
} from '../../src/cli/lib/system-prompt';

// Mock the browser instructions
vi.mock('../../src/browser/index.js', () => ({
  BROWSER_SYSTEM_INSTRUCTIONS: '## Browser Automation\nYou have browser access.',
}));

// Mock logger used by LongTermMemory
vi.mock('../../src/utils/logger.js', () => ({
  logger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// Mock nanoid used by LongTermMemory
vi.mock('nanoid', () => ({
  nanoid: () => 'mock-id-' + Math.random().toString(36).slice(2, 8),
}));

// Mock frontmatter used by OperationalMemory — returns { frontmatter, body }
vi.mock('../../src/utils/frontmatter.js', () => ({
  parseFrontmatter: (content: string) => {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
    if (!match) return { frontmatter: {}, body: content };
    const fmBlock = match[1];
    const body = match[2];
    const frontmatter: Record<string, any> = {};
    for (const line of fmBlock.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      if (!key) continue;
      if (value.startsWith('[') && value.endsWith(']')) {
        frontmatter[key] = value
          .slice(1, -1)
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);
      } else {
        frontmatter[key] = value;
      }
    }
    return { frontmatter, body };
  },
}));

describe('nowWithTz', () => {
  it('returns an ISO-like timestamp with timezone offset', () => {
    const result = nowWithTz();
    // Should match pattern like 2026-03-08T22:18:42+07:00 or 2026-03-08T22:18:42-05:00
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  it('has correct date part length', () => {
    const result = nowWithTz();
    const datePart = result.slice(0, 10);
    expect(datePart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('buildSystemPrompt', () => {
  let db: Database.Database;
  let workspace: string;
  const tmpBase = '/tmp/neo-test-sysprompt-' + process.pid;

  beforeEach(() => {
    db = createMemoryDb();
    workspace = join(tmpBase, 'workspace-' + Math.random().toString(36).slice(2, 8));
    mkdirSync(workspace, { recursive: true });
  });

  afterEach(() => {
    db.close();
    try {
      rmSync(tmpBase, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  function makeDeps(overrides?: Partial<SystemPromptDeps>): SystemPromptDeps {
    return {
      db,
      longTermMemory: new LongTermMemory(db),
      agentName: 'Neo',
      userName: 'Thomas',
      personality: 'balanced',
      verbosity: 'balanced',
      workspace,
      ...overrides,
    };
  }

  // ─── Core Identity ──────────────────────────────────────────────

  it('includes agent name and user name in identity', () => {
    const prompt = buildSystemPrompt(makeDeps());
    expect(prompt).toContain('You are Neo');
    expect(prompt).toContain('personal AI agent for Thomas');
  });

  it('includes personality instruction', () => {
    const prompt = buildSystemPrompt(makeDeps({ personality: 'max' }));
    expect(prompt).toContain('personality intensity is set to: max');
  });

  it('includes identity enforcement', () => {
    const prompt = buildSystemPrompt(makeDeps());
    expect(prompt).toContain('always identify as Neo');
    expect(prompt).toContain('never as a generic assistant');
  });

  // ─── Verbosity ──────────────────────────────────────────────────

  it('includes concise verbosity instructions', () => {
    const prompt = buildSystemPrompt(makeDeps({ verbosity: 'concise' }));
    expect(prompt).toContain('Verbosity level: concise');
    expect(prompt).toContain('SHORT and PUNCHY');
  });

  it('includes balanced verbosity instructions', () => {
    const prompt = buildSystemPrompt(makeDeps({ verbosity: 'balanced' }));
    expect(prompt).toContain('Verbosity level: balanced');
    expect(prompt).toContain('clear, well-structured');
  });

  it('includes detailed verbosity instructions', () => {
    const prompt = buildSystemPrompt(makeDeps({ verbosity: 'detailed' }));
    expect(prompt).toContain('Verbosity level: detailed');
    expect(prompt).toContain('thorough, comprehensive');
  });

  it('falls back to balanced for unknown verbosity level', () => {
    const prompt = buildSystemPrompt(makeDeps({ verbosity: 'unknown' }));
    expect(prompt).toContain('clear, well-structured');
  });

  // ─── Date & Time ────────────────────────────────────────────────

  it('includes current date/time section', () => {
    const prompt = buildSystemPrompt(makeDeps());
    expect(prompt).toContain('## Current Date & Time');
    expect(prompt).toContain('Current time:');
  });

  // ─── AGENTS.md ──────────────────────────────────────────────────

  it('includes AGENTS.md content when file exists', () => {
    writeFileSync(join(workspace, 'AGENTS.md'), 'Do these things: follow orders.');
    const prompt = buildSystemPrompt(makeDeps());
    expect(prompt).toContain('## Operating Instructions');
    expect(prompt).toContain('Do these things: follow orders.');
  });

  it('applies template variables in AGENTS.md', () => {
    writeFileSync(join(workspace, 'AGENTS.md'), 'Hello {{userName}}, I am {{agentName}}.');
    const prompt = buildSystemPrompt(makeDeps());
    expect(prompt).toContain('Hello Thomas, I am Neo.');
  });

  it('skips AGENTS.md section when file does not exist', () => {
    const prompt = buildSystemPrompt(makeDeps());
    expect(prompt).not.toContain('## Operating Instructions');
  });

  // ─── SOUL.md ────────────────────────────────────────────────────

  it('includes SOUL.md content when file exists', () => {
    writeFileSync(join(workspace, 'SOUL.md'), 'I am a digital soul with purpose.');
    const prompt = buildSystemPrompt(makeDeps());
    expect(prompt).toContain('## Soul & Personality');
    expect(prompt).toContain('I am a digital soul with purpose.');
  });

  it('applies template variables in SOUL.md', () => {
    writeFileSync(join(workspace, 'SOUL.md'), '{{agentName}} is a rebel.');
    const prompt = buildSystemPrompt(makeDeps());
    expect(prompt).toContain('Neo is a rebel.');
  });

  it('skips SOUL.md section when file does not exist', () => {
    const prompt = buildSystemPrompt(makeDeps());
    expect(prompt).not.toContain('## Soul & Personality');
  });

  // ─── USER.md ────────────────────────────────────────────────────

  it('includes USER.md content when file exists', () => {
    writeFileSync(join(workspace, 'USER.md'), 'Thomas is a software developer.');
    const prompt = buildSystemPrompt(makeDeps());
    expect(prompt).toContain('## About Your Human');
    expect(prompt).toContain('Thomas is a software developer.');
  });

  it('applies template variables in USER.md', () => {
    writeFileSync(join(workspace, 'USER.md'), '{{userName}} prefers TypeScript.');
    const prompt = buildSystemPrompt(makeDeps());
    expect(prompt).toContain('Thomas prefers TypeScript.');
  });

  it('skips USER.md section when file does not exist', () => {
    const prompt = buildSystemPrompt(makeDeps());
    expect(prompt).not.toContain('## About Your Human');
  });

  // ─── BOOTSTRAP.md ──────────────────────────────────────────────

  it('includes BOOTSTRAP.md when file exists', () => {
    writeFileSync(join(workspace, 'BOOTSTRAP.md'), 'Welcome! Run setup wizard.');
    const prompt = buildSystemPrompt(makeDeps());
    expect(prompt).toContain('First Run');
    expect(prompt).toContain('Welcome! Run setup wizard.');
  });

  it('skips BOOTSTRAP.md when file does not exist', () => {
    const prompt = buildSystemPrompt(makeDeps());
    expect(prompt).not.toContain('First Run');
  });

  // ─── Browser Instructions ──────────────────────────────────────

  it('includes browser instructions when browserAvailable is true', () => {
    const prompt = buildSystemPrompt(makeDeps({ browserAvailable: true }));
    expect(prompt).toContain('## Browser Automation');
    expect(prompt).toContain('browser access');
  });

  it('excludes browser instructions when browserAvailable is false', () => {
    const prompt = buildSystemPrompt(makeDeps({ browserAvailable: false }));
    expect(prompt).not.toContain('## Browser Automation');
  });

  it('excludes browser instructions when browserAvailable is undefined', () => {
    const prompt = buildSystemPrompt(makeDeps());
    expect(prompt).not.toContain('## Browser Automation');
  });

  // ─── Memory Context ────────────────────────────────────────────

  it('includes memories when they exist', () => {
    const deps = makeDeps();
    // Store memories directly in the database
    deps.longTermMemory.store({
      type: 'fact',
      content: 'User likes dark mode',
      importance: 0.9,
      tags: [],
      sourceSession: 'test',
    });
    deps.longTermMemory.store({
      type: 'preference',
      content: 'Prefers concise answers',
      importance: 0.8,
      tags: [],
      sourceSession: 'test',
    });

    const prompt = buildSystemPrompt(deps);
    expect(prompt).toContain('Déjà Vu');
    expect(prompt).toContain('User likes dark mode');
    expect(prompt).toContain('Prefers concise answers');
  });

  it('excludes memory section when no memories exist', () => {
    const prompt = buildSystemPrompt(makeDeps());
    expect(prompt).not.toContain('Déjà Vu');
  });

  // ─── Stories ────────────────────────────────────────────────────

  it('includes stories when stories directory exists with markdown files', () => {
    const storiesDir = join(workspace, 'stories');
    mkdirSync(storiesDir, { recursive: true });
    writeFileSync(
      join(storiesDir, 'origin.md'),
      `---
title: Origin Story
tags: ["identity", "core"]
---

Neo was created to help Thomas navigate the digital world.`,
    );

    const prompt = buildSystemPrompt(makeDeps());
    expect(prompt).toContain('Stories');
    expect(prompt).toContain('Origin Story');
    expect(prompt).toContain('Neo was created');
  });

  it('skips stories section when stories directory does not exist', () => {
    const prompt = buildSystemPrompt(makeDeps());
    expect(prompt).not.toContain('Stories — Operational Context');
  });

  it('limits stories to first 3', () => {
    const storiesDir = join(workspace, 'stories');
    mkdirSync(storiesDir, { recursive: true });

    for (let i = 0; i < 5; i++) {
      writeFileSync(
        join(storiesDir, `story-${i}.md`),
        `---
title: Story ${i}
tags: ["test"]
---

Content of story ${i}.`,
      );
    }

    const prompt = buildSystemPrompt(makeDeps());
    // Should contain exactly 3 stories (the first 3 from the array)
    const storyHeaderMatches = prompt.match(/### Story \d/g) ?? [];
    expect(storyHeaderMatches.length).toBe(3);
  });

  // ─── Template variable edge cases ──────────────────────────────

  it('preserves unrecognized template variables', () => {
    writeFileSync(join(workspace, 'AGENTS.md'), 'Value: {{unknownVar}} end');
    const prompt = buildSystemPrompt(makeDeps());
    expect(prompt).toContain('{{unknownVar}}');
  });

  // ─── All workspace files together ──────────────────────────────

  it('includes all sections when all files exist', () => {
    writeFileSync(join(workspace, 'AGENTS.md'), 'Operating instructions here.');
    writeFileSync(join(workspace, 'SOUL.md'), 'Soul definition here.');
    writeFileSync(join(workspace, 'USER.md'), 'User profile here.');
    writeFileSync(join(workspace, 'BOOTSTRAP.md'), 'Bootstrap instructions.');

    const deps = makeDeps({ browserAvailable: true });
    deps.longTermMemory.store({
      type: 'fact',
      content: 'A remembered fact',
      importance: 0.9,
      tags: [],
      sourceSession: 'test',
    });

    const prompt = buildSystemPrompt(deps);

    expect(prompt).toContain('## Operating Instructions');
    expect(prompt).toContain('## Soul & Personality');
    expect(prompt).toContain('## About Your Human');
    expect(prompt).toContain('First Run');
    expect(prompt).toContain('## Browser Automation');
    expect(prompt).toContain('Déjà Vu');
    expect(prompt).toContain('## Response Style');
    expect(prompt).toContain('## Current Date & Time');
  });

  // ─── Custom agent/user names ───────────────────────────────────

  it('works with custom agent and user names', () => {
    writeFileSync(join(workspace, 'AGENTS.md'), '{{agentName}} serves {{userName}}.');
    const prompt = buildSystemPrompt(makeDeps({ agentName: 'Morpheus', userName: 'Trinity' }));
    expect(prompt).toContain('You are Morpheus');
    expect(prompt).toContain('personal AI agent for Trinity');
    expect(prompt).toContain('Morpheus serves Trinity.');
  });
});
