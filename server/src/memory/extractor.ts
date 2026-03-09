/**
 * ░▒▓ MEMORY EXTRACTOR ▓▒░
 *
 * "I know kung fu. Well, I know pattern matching."
 *
 * Regex-based extraction of preferences, decisions, facts, and corrections
 * from user messages. Phase 2 approach — upgrade to AI-assisted in Phase 3.
 */

import type { MemoryEntry, MemoryType } from '@neo-agent/shared';
import { logger } from '../utils/logger.js';

const log = logger('memory:extractor');

interface ExtractionPattern {
  type: MemoryType;
  pattern: RegExp;
  importance: number;
}

const EXTRACTION_PATTERNS: ExtractionPattern[] = [
  // Preferences
  { type: 'preference', pattern: /i prefer\b/i, importance: 0.8 },
  { type: 'preference', pattern: /i always\b/i, importance: 0.7 },
  { type: 'preference', pattern: /i never\b/i, importance: 0.7 },
  { type: 'preference', pattern: /i like to\b/i, importance: 0.6 },
  { type: 'preference', pattern: /i don'?t like\b/i, importance: 0.6 },
  { type: 'preference', pattern: /i want\b/i, importance: 0.5 },

  // Decisions
  { type: 'decision', pattern: /i decided\b/i, importance: 0.8 },
  { type: 'decision', pattern: /let'?s go with\b/i, importance: 0.8 },
  { type: 'decision', pattern: /we('re| are) going with\b/i, importance: 0.8 },
  { type: 'decision', pattern: /i chose\b/i, importance: 0.7 },
  { type: 'decision', pattern: /we('ll| will) use\b/i, importance: 0.7 },

  // Facts
  { type: 'fact', pattern: /remember that\b/i, importance: 0.9 },
  { type: 'fact', pattern: /note that\b/i, importance: 0.7 },
  { type: 'fact', pattern: /important:\s/i, importance: 0.8 },
  { type: 'fact', pattern: /fyi\b/i, importance: 0.6 },
  { type: 'fact', pattern: /for (your|the) record\b/i, importance: 0.7 },

  // Corrections
  { type: 'correction', pattern: /actually,?\s/i, importance: 0.7 },
  { type: 'correction', pattern: /no,?\s+that'?s (wrong|incorrect|not right)/i, importance: 0.8 },
  { type: 'correction', pattern: /don'?t (ever|do that)/i, importance: 0.8 },
  { type: 'correction', pattern: /stop (doing|using)\b/i, importance: 0.7 },

  // Learnings
  { type: 'learning', pattern: /i (just )?learned\b/i, importance: 0.6 },
  { type: 'learning', pattern: /turns out\b/i, importance: 0.6 },
  { type: 'learning', pattern: /TIL\b/, importance: 0.6 },
];

export class MemoryExtractor {
  extractFromMessage(content: string, sessionId: string): Omit<MemoryEntry, 'id'>[] {
    const entries: Omit<MemoryEntry, 'id'>[] = [];
    const seen = new Set<MemoryType>();

    for (const { type, pattern, importance } of EXTRACTION_PATTERNS) {
      // Only one extraction per type per message to avoid duplicates
      if (seen.has(type)) continue;

      if (pattern.test(content)) {
        seen.add(type);
        entries.push({
          type,
          content: content.slice(0, 500), // truncate
          importance,
          tags: this.extractTags(content),
          sourceSession: sessionId,
        });
      }
    }

    if (entries.length > 0) {
      log.debug('Extracted memories', {
        count: entries.length,
        types: entries.map((e) => e.type),
        importance: entries.map((e) => e.importance),
      });
    }

    return entries;
  }

  private extractTags(content: string): string[] {
    const tags: string[] = [];
    const lower = content.toLowerCase();

    // Tech tags
    const techPatterns = [
      'typescript',
      'javascript',
      'python',
      'react',
      'next.js',
      'node',
      'docker',
      'git',
      'sql',
      'css',
      'html',
      'api',
      'database',
      'supabase',
      'sqlite',
      'redis',
      'aws',
      'gcp',
      'vercel',
    ];
    for (const tech of techPatterns) {
      if (lower.includes(tech)) tags.push(tech);
    }

    // Domain tags
    if (/deploy|ci\/cd|pipeline/i.test(content)) tags.push('devops');
    if (/test|spec|assert/i.test(content)) tags.push('testing');
    if (/ui|ux|design|layout|style/i.test(content)) tags.push('ui');
    if (/security|auth|permission|token/i.test(content)) tags.push('security');
    if (/performance|speed|optimize|cache/i.test(content)) tags.push('performance');

    return tags;
  }
}
