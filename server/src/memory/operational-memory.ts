/**
 * ░▒▓ OPERATIONAL MEMORY ▓▒░ (Tier 5: The Stories)
 *
 * "Let me tell you a story about who I am..."
 *
 * File-based narratives from workspace/stories/*.md.
 * Fed as context, not dense docs. Tag-scored for relevance.
 */

import type Database from 'better-sqlite3';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { nanoid } from 'nanoid';
import { join } from 'path';
import { parseFrontmatter } from '../utils/frontmatter.js';

export interface Story {
  filename: string;
  title: string;
  tags: string[];
  content: string;
}

export interface StoryContext extends Story {
  score: number;
}

export class OperationalMemory {
  constructor(
    private db: Database.Database,
    private storiesDir: string,
  ) {}

  getRelevantStories(query: string, maxStories = 3): StoryContext[] {
    const stories = this.loadAllStories();
    return stories
      .map((s) => ({ ...s, score: this.scoreRelevance(s, query) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxStories);
  }

  loadAllStories(): Story[] {
    if (!existsSync(this.storiesDir)) return [];

    const files = readdirSync(this.storiesDir).filter((f) => f.endsWith('.md'));
    return files.map((f) => {
      const content = readFileSync(join(this.storiesDir, f), 'utf-8');
      const { title, tags } = this.parseStoryFrontmatter(content);
      const story: Story = { filename: f, title, tags, content };

      // Track in DB
      this.trackStory(story);

      return story;
    });
  }

  private trackStory(story: Story): void {
    this.db
      .prepare(
        `INSERT INTO stories (id, filename, title, tags, last_loaded_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(filename) DO UPDATE SET last_loaded_at = excluded.last_loaded_at`,
      )
      .run(nanoid(), story.filename, story.title, story.tags.join(','), Date.now());
  }

  private scoreRelevance(story: Story, query: string): number {
    const queryWords = query.toLowerCase().split(/\s+/);
    const tagSet = new Set(story.tags.map((t) => t.toLowerCase()));
    const titleWords = story.title.toLowerCase().split(/\s+/);
    const contentLower = story.content.toLowerCase();

    let score = 0;

    for (const word of queryWords) {
      if (word.length < 2) continue;
      // Tag match = 3 points
      if (tagSet.has(word)) score += 3;
      // Title match = 2 points
      if (titleWords.includes(word)) score += 2;
      // Content match = 1 point
      if (contentLower.includes(word)) score += 1;
    }

    return score;
  }

  private parseStoryFrontmatter(content: string): { title: string; tags: string[] } {
    const { frontmatter } = parseFrontmatter(content);

    if (!frontmatter.title && !frontmatter.tags) {
      // Fallback: use first heading as title
      const headingMatch = content.match(/^#\s+(.+)/m);
      return { title: headingMatch?.[1] ?? 'Untitled', tags: [] };
    }

    const tags = Array.isArray(frontmatter.tags)
      ? frontmatter.tags.map((t: string) => t.replace(/['"]/g, ''))
      : [];

    return {
      title: frontmatter.title?.trim() ?? 'Untitled',
      tags,
    };
  }
}
