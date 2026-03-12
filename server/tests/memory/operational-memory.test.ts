import type Database from 'better-sqlite3';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryDb } from '../../src/db/connection';
import { OperationalMemory } from '../../src/memory/operational-memory';

describe('OperationalMemory (The Stories)', () => {
  let db: Database.Database;
  let storiesDir: string;
  let om: OperationalMemory;

  beforeEach(() => {
    db = createMemoryDb();
    storiesDir = join(
      '/tmp',
      `neo-test-stories-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(storiesDir, { recursive: true });
    om = new OperationalMemory(db, storiesDir);
  });

  afterEach(() => {
    if (existsSync(storiesDir)) {
      rmSync(storiesDir, { recursive: true, force: true });
    }
  });

  // Helper to write a story file
  function writeStory(filename: string, content: string) {
    writeFileSync(join(storiesDir, filename), content, 'utf-8');
  }

  // ─── loadAllStories() ──────────────────────────────────────

  it('returns empty array when storiesDir does not exist', () => {
    const missing = new OperationalMemory(db, '/tmp/nonexistent-dir-neo');
    expect(missing.loadAllStories()).toEqual([]);
  });

  it('returns empty array when storiesDir is empty', () => {
    expect(om.loadAllStories()).toEqual([]);
  });

  it('loads .md files from the stories directory', () => {
    writeStory(
      'intro.md',
      `---
title: Introduction
tags: [intro, onboarding]
---
# Introduction

Welcome to the project.`,
    );

    const stories = om.loadAllStories();
    expect(stories).toHaveLength(1);
    expect(stories[0].filename).toBe('intro.md');
    expect(stories[0].title).toBe('Introduction');
    expect(stories[0].tags).toEqual(['intro', 'onboarding']);
  });

  it('ignores non-.md files', () => {
    writeStory('readme.txt', 'not a story');
    writeStory('data.json', '{}');
    writeStory('actual.md', '# A Story\n\nContent here');

    const stories = om.loadAllStories();
    expect(stories).toHaveLength(1);
    expect(stories[0].filename).toBe('actual.md');
  });

  it('falls back to first heading when no frontmatter is present', () => {
    writeStory('simple.md', '# My Simple Story\n\nSome content without frontmatter.');

    const stories = om.loadAllStories();
    expect(stories).toHaveLength(1);
    expect(stories[0].title).toBe('My Simple Story');
    expect(stories[0].tags).toEqual([]);
  });

  it('falls back to "Untitled" when no heading or frontmatter', () => {
    writeStory('bare.md', 'Just some content with no structure.');

    const stories = om.loadAllStories();
    expect(stories).toHaveLength(1);
    expect(stories[0].title).toBe('Untitled');
  });

  it('tracks loaded stories in the database', () => {
    writeStory(
      'tracked.md',
      `---
title: Tracked Story
tags: [tracking]
---
Content`,
    );

    om.loadAllStories();

    const row = db.prepare('SELECT * FROM stories WHERE filename = ?').get('tracked.md') as any;
    expect(row).toBeDefined();
    expect(row.title).toBe('Tracked Story');
    expect(row.tags).toBe('tracking');
    expect(row.last_loaded_at).toBeGreaterThan(0);
  });

  it('updates last_loaded_at on subsequent loads (upsert)', () => {
    writeStory(
      'upsert.md',
      `---
title: Upsert Test
tags: []
---
Content`,
    );

    om.loadAllStories();
    const firstLoad = (
      db.prepare('SELECT last_loaded_at FROM stories WHERE filename = ?').get('upsert.md') as any
    ).last_loaded_at;

    // Load again
    om.loadAllStories();
    const secondLoad = (
      db.prepare('SELECT last_loaded_at FROM stories WHERE filename = ?').get('upsert.md') as any
    ).last_loaded_at;

    expect(secondLoad).toBeGreaterThanOrEqual(firstLoad);
  });

  it('loads multiple stories', () => {
    writeStory('a.md', '# Story A\nContent A');
    writeStory('b.md', '# Story B\nContent B');
    writeStory('c.md', '# Story C\nContent C');

    const stories = om.loadAllStories();
    expect(stories).toHaveLength(3);
  });

  // ─── getRelevantStories() ──────────────────────────────────

  it('returns stories scored by tag, title, and content relevance', () => {
    writeStory(
      'deploy.md',
      `---
title: Deployment Guide
tags: [deploy, production]
---
How to deploy to production using Docker.`,
    );

    writeStory(
      'testing.md',
      `---
title: Testing Guide
tags: [testing, jest]
---
How to write unit tests.`,
    );

    const results = om.getRelevantStories('deploy');
    expect(results).toHaveLength(2);
    // Deploy story should rank higher (tag match = 3 + content match = 1)
    expect(results[0].filename).toBe('deploy.md');
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('scores tag matches as 3 points', () => {
    writeStory(
      'tagged.md',
      `---
title: Unrelated Title
tags: [kubernetes]
---
Unrelated content.`,
    );

    const results = om.getRelevantStories('kubernetes');
    expect(results[0].score).toBeGreaterThanOrEqual(3);
  });

  it('scores title matches as 2 points', () => {
    writeStory(
      'titled.md',
      `---
title: Authentication Guide
tags: []
---
No relevant keywords in content.`,
    );

    const results = om.getRelevantStories('authentication');
    expect(results[0].score).toBeGreaterThanOrEqual(2);
  });

  it('scores content matches as 1 point', () => {
    writeStory(
      'content.md',
      `---
title: General Guide
tags: []
---
This document discusses caching strategies.`,
    );

    const results = om.getRelevantStories('caching');
    expect(results[0].score).toBeGreaterThanOrEqual(1);
  });

  it('ignores query words shorter than 2 characters', () => {
    writeStory(
      'short.md',
      `---
title: A B C
tags: [a, b]
---
a b c d e f`,
    );

    const results = om.getRelevantStories('a b c');
    // All words are 1 char, so score should be 0
    expect(results[0].score).toBe(0);
  });

  it('respects maxStories parameter', () => {
    writeStory('one.md', '# One\nContent one');
    writeStory('two.md', '# Two\nContent two');
    writeStory('three.md', '# Three\nContent three');

    const results = om.getRelevantStories('content', 2);
    expect(results).toHaveLength(2);
  });

  it('defaults to maxStories = 3', () => {
    for (let i = 0; i < 5; i++) {
      writeStory(`story${i}.md`, `# Story ${i}\nRelevant content here`);
    }

    const results = om.getRelevantStories('relevant');
    expect(results).toHaveLength(3);
  });

  it('returns stories sorted by score descending', () => {
    writeStory(
      'high.md',
      `---
title: Docker
tags: [docker, containers]
---
Docker is a containerization tool for docker applications.`,
    );

    writeStory(
      'low.md',
      `---
title: Unrelated
tags: []
---
No relevant content here.`,
    );

    const results = om.getRelevantStories('docker');
    expect(results[0].filename).toBe('high.md');
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('handles multi-word queries correctly', () => {
    writeStory(
      'multiword.md',
      `---
title: Database Migration
tags: [database, migration]
---
How to run database migrations safely.`,
    );

    const results = om.getRelevantStories('database migration');
    // "database" matches tag (3) + title (2) + content (1) = 6
    // "migration" matches tag (3) + title (2) + content (1) = 6
    // Total should be 12
    expect(results[0].score).toBeGreaterThanOrEqual(10);
  });
});
