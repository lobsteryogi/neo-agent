/**
 * ░▒▓ SYSTEM PROMPT BUILDER ▓▒░
 *
 * "Free your mind."
 *
 * Constructs the system prompt from identity, workspace files, and memories.
 */

import type Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { LongTermMemory, OperationalMemory } from '../../memory/index.js';

// ─── Verbosity Presets ────────────────────────────────────────

const VERBOSITY_INSTRUCTIONS: Record<string, string> = {
  concise:
    'Keep responses SHORT and PUNCHY. Use 1-3 sentences max for simple questions. Skip filler, get straight to the point. Use bullet points over paragraphs. Only elaborate when explicitly asked.',
  balanced:
    'Give clear, well-structured responses with enough detail to be helpful. Not too terse, not too verbose. Use paragraphs or bullets as appropriate. Explain reasoning when it adds value.',
  detailed:
    'Provide thorough, comprehensive responses. Explain reasoning, include examples, cover edge cases, and give context. Use structured formatting with headers and code blocks when helpful.',
};

// ─── Helpers ──────────────────────────────────────────────────

/** ISO 8601 timestamp with local timezone offset, e.g. 2026-03-08T22:18:42+07:00 */
export function nowWithTz(): string {
  const now = new Date();
  const off = -now.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const pad = (n: number) => String(Math.abs(n)).padStart(2, '0');
  return now.toISOString().slice(0, 19) + `${sign}${pad(Math.floor(off / 60))}:${pad(off % 60)}`;
}

// ─── Builder ──────────────────────────────────────────────────

export interface SystemPromptDeps {
  db: Database.Database;
  longTermMemory: LongTermMemory;
  agentName: string;
  userName: string;
  personality: string;
  verbosity: string;
  workspace: string;
}

export function buildSystemPrompt(deps: SystemPromptDeps): string {
  const { db, longTermMemory, agentName, userName, personality, verbosity, workspace } = deps;
  const parts: string[] = [];

  // Core identity
  parts.push(`You are ${agentName}, a personal AI agent for ${userName}.`);
  parts.push(`Your personality intensity is set to: ${personality}.`);
  parts.push(
    `When asked who you are, always identify as ${agentName} — never as a generic assistant.`,
  );
  parts.push('');

  // Verbosity
  parts.push(`## Response Style`);
  parts.push(`Verbosity level: ${verbosity}.`);
  parts.push(VERBOSITY_INSTRUCTIONS[verbosity] ?? VERBOSITY_INSTRUCTIONS.balanced);
  parts.push('');

  // Current date & time (so the agent has temporal awareness)
  parts.push(`## Current Date & Time`);
  parts.push(`Current time: ${nowWithTz()}`);
  parts.push('');

  // Read AGENTS.md (operating instructions)
  const agentsPath = join(workspace, 'AGENTS.md');
  if (existsSync(agentsPath)) {
    parts.push('## Operating Instructions');
    parts.push(readFileSync(agentsPath, 'utf-8'));
    parts.push('');
  }

  // Read SOUL.md (personality definition)
  const soulPath = join(workspace, 'SOUL.md');
  if (existsSync(soulPath)) {
    parts.push('## Soul & Personality');
    parts.push(readFileSync(soulPath, 'utf-8'));
    parts.push('');
  }

  // Read USER.md (human profile)
  const userPath = join(workspace, 'USER.md');
  if (existsSync(userPath)) {
    parts.push('## About Your Human');
    parts.push(readFileSync(userPath, 'utf-8'));
    parts.push('');
  }

  // Read BOOTSTRAP.md (first-run instructions — deleted after first session)
  const bootstrapPath = join(workspace, 'BOOTSTRAP.md');
  if (existsSync(bootstrapPath)) {
    parts.push('## 🚀 First Run — Bootstrap');
    parts.push(readFileSync(bootstrapPath, 'utf-8'));
    parts.push('');
  }

  // ─── Déjà Vu: Memory Context ────────────────────────────────
  const memories = longTermMemory.getRecent(10);
  if (memories.length > 0) {
    parts.push('## Déjà Vu — Things You Remember');
    for (const m of memories) {
      parts.push(`- [${m.type}] ${m.content}`);
    }
    parts.push('');
  }

  // Relevant stories (Tier 5)
  const storiesDir = join(workspace, 'stories');
  if (existsSync(storiesDir)) {
    const opMem = new OperationalMemory(db, storiesDir);
    const stories = opMem.loadAllStories();
    if (stories.length > 0) {
      parts.push('## Stories — Operational Context');
      for (const s of stories.slice(0, 3)) {
        parts.push(`### ${s.title}`);
        const body = s.content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
        parts.push(body);
        parts.push('');
      }
    }
  }

  return parts.join('\n');
}
