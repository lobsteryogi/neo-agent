/**
 * ░▒▓ SKILLS ROUTES ▓▒░
 *
 * "I know kung fu."
 *
 * REST endpoints for skill management.
 * GET  /api/skills          — list all loaded skills
 * GET  /api/skills/:name    — get full skill detail
 * POST /api/skills/generate — AI-generate a skill draft from prompt or URL
 *                             GitHub URLs: reads real files (SKILL.md → pre-fill, else collect + generate)
 * POST /api/skills          — save a skill to workspace/skills/ or ~/.claude/skills/
 * DELETE /api/skills/:name  — delete a local skill
 */

import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Express } from 'express';
import type { ClaudeBridge } from '../core/claude-bridge.js';
import type { SkillRegistry } from '../skills/index.js';
import { parseFrontmatter } from '../utils/frontmatter.js';
import { stripMarkdownFences } from '../utils/strip-fences.js';
import { logger } from '../utils/logger.js';
import { wrapRoute } from './route-handler.js';

const log = logger('skills-routes');

// ─── AI System Prompt ─────────────────────────────────────────

const SKILL_SYSTEM_PROMPT = `You create SKILL.md files for Claude Code agents.
A skill defines a reusable AI capability that can be triggered by the user.

Output ONLY the complete SKILL.md content. No markdown fences, no explanation before or after.

Required format:
---
name: kebab-case-name
description: >
  One to two sentences: what this skill does and when to invoke it.
tags: [tag1, tag2, tag3]
---

# Skill Title

Instructions covering: what the skill does, when to use it, key capabilities, and example usage.

Rules:
- name: lowercase, hyphens only, concise, max 40 chars
- description: mention trigger phrases and purpose, max 2 sentences
- tags: 2–5 relevant lowercase tags
- instructions: practical markdown, specific about what the skill enables`;

// ─── Shared fetch helper ──────────────────────────────────────

async function fetchText(url: string, timeoutMs = 15_000): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'neo-agent/1.0' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

// ─── GitHub URL handling ──────────────────────────────────────

interface GitHubRef {
  owner: string;
  repo: string;
  type: 'tree' | 'blob' | 'raw' | 'root';
  branch: string;
  path: string;
}

function parseGitHubUrl(url: string): GitHubRef | null {
  // Raw: https://raw.githubusercontent.com/owner/repo/branch/path
  const rawMatch = url.match(/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.*)/);
  if (rawMatch) {
    return {
      owner: rawMatch[1],
      repo: rawMatch[2],
      branch: rawMatch[3],
      path: rawMatch[4],
      type: 'raw',
    };
  }

  // Blob/Tree: https://github.com/owner/repo/(tree|blob)/branch/path
  const treeMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/(tree|blob)\/([^/]+)\/(.*)/);
  if (treeMatch) {
    return {
      owner: treeMatch[1],
      repo: treeMatch[2],
      type: treeMatch[3] as 'tree' | 'blob',
      branch: treeMatch[4],
      path: treeMatch[5],
    };
  }

  // Repo root: https://github.com/owner/repo
  const rootMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/?$/);
  if (rootMatch) {
    return { owner: rootMatch[1], repo: rootMatch[2], type: 'root', branch: 'main', path: '' };
  }

  return null;
}

function toRawUrl(ref: GitHubRef, filePath: string): string {
  return `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${ref.branch}/${filePath}`;
}

interface GitHubApiFile {
  name: string;
  type: 'file' | 'dir';
  download_url: string | null;
  path: string;
}

async function listGitHubDir(ref: GitHubRef, dirPath: string): Promise<GitHubApiFile[]> {
  const apiUrl = `https://api.github.com/repos/${ref.owner}/${ref.repo}/contents/${dirPath}?ref=${ref.branch}`;
  const res = await fetch(apiUrl, {
    headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'neo-agent/1.0' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<GitHubApiFile[]>;
}

/**
 * Fetches a GitHub URL and returns either:
 * - { skillMd: string }  → found a SKILL.md; use as-is, no Claude needed
 * - { context: string }  → collected file contents; pass to Claude for generation
 */
async function fetchGitHubContent(
  ref: GitHubRef,
): Promise<{ skillMd: string } | { context: string }> {
  // ── Raw file URL ──────────────────────────────────────────
  if (ref.type === 'raw') {
    const content = await fetchText(toRawUrl(ref, ref.path));
    if (ref.path.toLowerCase().endsWith('skill.md')) {
      return { skillMd: content };
    }
    return { context: `### ${ref.path}\n${content.slice(0, 4000)}` };
  }

  // ── Blob: specific file ───────────────────────────────────
  if (ref.type === 'blob') {
    const rawUrl = toRawUrl(ref, ref.path);
    const content = await fetchText(rawUrl);
    if (ref.path.toLowerCase().endsWith('skill.md')) {
      return { skillMd: content };
    }
    return { context: `### ${ref.path.split('/').pop()}\n${content.slice(0, 4000)}` };
  }

  // ── Tree / root: list directory ───────────────────────────
  const files = await listGitHubDir(ref, ref.path);

  // 1. Look for SKILL.md first
  const skillMdFile = files.find(
    (f) => f.type === 'file' && f.name.toLowerCase() === 'skill.md' && f.download_url,
  );
  if (skillMdFile) {
    log.info('found SKILL.md in directory', { path: skillMdFile.path });
    const content = await fetchText(skillMdFile.download_url!);
    return { skillMd: content };
  }

  // 2. No SKILL.md — collect text files for Claude
  const TEXT_EXTS = /\.(md|txt|py|js|ts|sh|yaml|yml|json|toml)$/i;
  const SKIP = /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/i;

  const textFiles = files
    .filter(
      (f) => f.type === 'file' && TEXT_EXTS.test(f.name) && !SKIP.test(f.name) && f.download_url,
    )
    .slice(0, 8);

  if (textFiles.length === 0) {
    // Fall back to directory listing as context
    const names = files.map((f) => `${f.type === 'dir' ? '📁' : '📄'} ${f.name}`).join('\n');
    return {
      context: `GitHub directory: ${ref.owner}/${ref.repo}/${ref.path}\n\nFiles:\n${names}`,
    };
  }

  const parts: string[] = [];
  for (const file of textFiles) {
    try {
      const text = await fetchText(file.download_url!);
      parts.push(`### ${file.name}\n${text.slice(0, 2500)}`);
    } catch {
      // skip unreadable files
    }
  }

  return { context: parts.join('\n\n').slice(0, 8000) };
}

// ─── Parse SKILL.md into draft fields ────────────────────────

function parseSkillMd(raw: string) {
  const { frontmatter, body } = parseFrontmatter(raw);
  return {
    name: (frontmatter.name as string) ?? 'new-skill',
    description: ((frontmatter.description as string) ?? '').trim(),
    tags: Array.isArray(frontmatter.tags)
      ? (frontmatter.tags as string[])
      : typeof frontmatter.tags === 'string'
        ? (frontmatter.tags as string)
            .split(',')
            .map((t: string) => t.trim())
            .filter(Boolean)
        : [],
    instructions: body.trim(),
  };
}

// ─── Plain URL fetch + HTML strip ────────────────────────────

async function fetchUrlText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; neo-agent/1.0)' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get('content-type') ?? '';
  const raw = await res.text();

  if (ct.includes('text/html')) {
    return raw
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 6000);
  }

  return raw.slice(0, 6000);
}

// ─── Bridge generation helper ─────────────────────────────────

async function generateSkillMd(bridge: ClaudeBridge, userMessage: string): Promise<string> {
  const result = await bridge.run(userMessage, {
    cwd: process.cwd(),
    model: 'haiku',
    maxTurns: 1,
    allowedTools: [],
    systemPrompt: SKILL_SYSTEM_PROMPT,
    timeoutMs: 30_000,
    permissionMode: 'default',
  });
  if (!result.success) throw new Error(result.message || 'Generation failed');
  const raw = ((result.data as any)?.content as string) ?? '';
  return stripMarkdownFences(raw);
}

// ─── Route Registration ────────────────────────────────────────

export function registerSkillRoutes(
  app: Express,
  skillRegistry: SkillRegistry,
  skillsDir: string,
  bridge: ClaudeBridge,
): void {
  // ─── List skills ─────────────────────────────────────────────
  app.get(
    '/api/skills',
    wrapRoute((_req, res) => {
      const claudeSkillsDir = join(process.env.HOME ?? '/root', '.claude', 'skills');
      const skills = skillRegistry.getAll().map(({ name, description, tags, path }) => ({
        name,
        description,
        tags,
        source: path.startsWith(claudeSkillsDir) ? 'global' : 'local',
      }));
      res.json(skills);
    }),
  );

  // ─── Get skill detail ─────────────────────────────────────────
  app.get(
    '/api/skills/:name',
    wrapRoute((req, res) => {
      const skill = skillRegistry.get(req.params.name as string);
      if (!skill) return res.status(404).json({ error: 'Skill not found' });
      res.json(skill);
    }),
  );

  // ─── Generate skill draft ─────────────────────────────────────
  app.post(
    '/api/skills/generate',
    wrapRoute(async (req, res) => {
      const { prompt, url } = req.body as { prompt?: string; url?: string };

      if (!prompt?.trim() && !url?.trim()) {
        return res.status(400).json({ error: 'prompt or url is required' });
      }

      // ── GitHub URL: special handling ──────────────────────────
      if (url?.trim()) {
        const ghRef = parseGitHubUrl(url.trim());

        if (ghRef) {
          log.info('GitHub URL detected', {
            owner: ghRef.owner,
            repo: ghRef.repo,
            path: ghRef.path,
          });

          let ghResult: { skillMd: string } | { context: string };
          try {
            ghResult = await fetchGitHubContent(ghRef);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            return res.status(400).json({ error: `GitHub fetch failed: ${msg}` });
          }

          // Found a real SKILL.md — return directly, no Claude needed
          if ('skillMd' in ghResult) {
            const parsed = parseSkillMd(ghResult.skillMd);
            log.info('skill pre-filled from SKILL.md', { name: parsed.name });
            return res.json({ ...parsed, rawContent: ghResult.skillMd, via: 'skill-md' });
          }

          // No SKILL.md — generate from collected file contents
          const extraContext = prompt?.trim()
            ? `\n\nAdditional context from user: ${prompt.trim()}`
            : '';
          const userMessage = `Create a SKILL.md for a Claude Code skill based on this GitHub repository.\nURL: ${url}\n\n${ghResult.context}${extraContext}`;

          log.info('generating skill from GitHub files', { url });
          const skillMd = await generateSkillMd(bridge, userMessage);
          const parsed = parseSkillMd(skillMd);
          log.info('skill generated from GitHub', { name: parsed.name });
          return res.json({ ...parsed, rawContent: skillMd, via: 'github-generated' });
        }

        // ── Plain URL: fetch HTML ──────────────────────────────
        log.info('fetching plain URL for skill generation', { url });
        let pageText: string;
        try {
          pageText = await fetchUrlText(url.trim());
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return res.status(400).json({ error: `Failed to fetch URL: ${msg}` });
        }
        const extraContext = prompt?.trim() ? `\n\nAdditional context: ${prompt.trim()}` : '';
        const userMessage = `Create a SKILL.md based on this webpage.\nURL: ${url}\n\nContent:\n${pageText}${extraContext}`;

        log.info('generating skill from URL', { url });
        const skillMd = await generateSkillMd(bridge, userMessage);
        const parsed = parseSkillMd(skillMd);
        log.info('skill generated from URL', { name: parsed.name });
        return res.json({ ...parsed, rawContent: skillMd, via: 'url-generated' });
      }

      // ── Prompt only ───────────────────────────────────────────
      const userMessage = `Create a SKILL.md for a Claude Code skill based on this description:\n${prompt!.trim()}`;
      log.info('generating skill from prompt');
      const skillMd = await generateSkillMd(bridge, userMessage);
      const parsed = parseSkillMd(skillMd);
      log.info('skill generated from prompt', { name: parsed.name });
      return res.json({ ...parsed, rawContent: skillMd, via: 'prompt-generated' });
    }),
  );

  // ─── Delete skill ────────────────────────────────────────────
  app.delete(
    '/api/skills/:name',
    wrapRoute((req, res) => {
      const name = req.params.name as string;
      const skill = skillRegistry.get(name);
      if (!skill) return res.status(404).json({ error: 'Skill not found' });

      if (!skill.path.startsWith(skillsDir)) {
        return res.status(403).json({ error: 'Cannot delete built-in Claude skills' });
      }

      rmSync(skill.path, { recursive: true, force: true });
      skillRegistry.remove(name);
      log.info('skill deleted', { name, path: skill.path });
      res.json({ ok: true });
    }),
  );

  // ─── Save skill ───────────────────────────────────────────────
  app.post(
    '/api/skills',
    wrapRoute((req, res) => {
      const {
        name,
        rawContent,
        destination = 'local',
      } = req.body as {
        name?: string;
        rawContent?: string;
        destination?: 'local' | 'global';
      };

      if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
      if (!rawContent?.trim()) return res.status(400).json({ error: 'rawContent is required' });

      const safeName = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-');

      if (skillRegistry.has(safeName)) {
        return res.status(409).json({ error: `Skill "${safeName}" already exists` });
      }

      const claudeSkillsDir = join(process.env.HOME ?? '/root', '.claude', 'skills');
      const targetDir = destination === 'global' ? claudeSkillsDir : skillsDir;
      const skillDir = join(targetDir, safeName);
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(join(skillDir, 'SKILL.md'), rawContent, 'utf-8');

      skillRegistry.loadFromDirectory(targetDir);

      const skill = skillRegistry.get(safeName);
      if (!skill) {
        return res
          .status(500)
          .json({ error: 'Skill saved but failed to load — check SKILL.md format' });
      }

      log.info('skill saved', { name: safeName, path: skillDir, destination });
      res.status(201).json(skill);
    }),
  );
}
