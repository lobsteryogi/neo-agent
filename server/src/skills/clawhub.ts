/**
 * ░▒▓ CLAWHUB CLIENT ▓▒░
 *
 * "Tank, load the jump program."
 *
 * Client for ClawHub.ai — the skill registry for agents.
 * Provides vector-search skill discovery from 3,000+ community skills.
 *
 * API: https://clawhub.ai/api/v1
 * Rate limit: 120 req/min (no auth for reads)
 */

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

  /**
   * Semantic vector search for skills on ClawHub.
   */
  async search(query: string, limit = 5): Promise<ClawHubSkillMeta[]> {
    const url = `${this.baseUrl}/search?q=${encodeURIComponent(query)}&limit=${limit}`;
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`ClawHub search failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as ClawHubSearchResult;
    return data.results ?? [];
  }

  /**
   * Get full metadata for a specific skill by slug.
   */
  async getSkill(slug: string): Promise<ClawHubSkillMeta | null> {
    const url = `${this.baseUrl}/skills/${encodeURIComponent(slug)}`;
    const res = await fetch(url);

    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`ClawHub getSkill failed: ${res.status} ${res.statusText}`);
    }

    return (await res.json()) as ClawHubSkillMeta;
  }

  /**
   * Download a skill bundle (SKILL.md + supporting files) as JSON.
   */
  async download(slug: string): Promise<ClawHubSkillBundle | null> {
    const url = `${this.baseUrl}/download?slug=${encodeURIComponent(slug)}`;
    const res = await fetch(url);

    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`ClawHub download failed: ${res.status} ${res.statusText}`);
    }

    return (await res.json()) as ClawHubSkillBundle;
  }

  /**
   * Get raw file content from a skill.
   */
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
