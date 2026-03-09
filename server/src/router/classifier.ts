/**
 * ░▒▓ TASK CLASSIFIER ▓▒░
 *
 * "There is no spoon."
 *
 * Heuristic task classification — regex for v1.
 * Scores inbound messages across 6 axes to drive routing decisions.
 */

import type { TaskClassification } from '@neo-agent/shared';
import { logger } from '../utils/logger.js';

const log = logger('classifier');

/** Context passed alongside the raw message content */
export interface ClassifierContext {
  /** Current session token count */
  tokenCount: number;
  /** Whether the session already has tool calls in-flight */
  hasActiveTools?: boolean;
}

// ─── Keyword Dictionaries ──────────────────────────────────────

const HIGH_COMPLEXITY = [
  'architect',
  'design system',
  'refactor entire',
  'migration strategy',
  'microservice',
  'distributed',
  'scalab',
  'infrastructure',
  'rewrite',
  'overhaul',
  'redesign',
  'optimize the entire',
  'build a complete',
  'full-stack',
  'database schema',
  'system design',
  'build an app',
  'build a web',
  'build a mobile',
  'build a dashboard',
  'build a platform',
  'create an app',
  'create a web',
];

const MEDIUM_COMPLEXITY = [
  'implement',
  'create a',
  'build a',
  'add a feature',
  'integrate',
  'connect',
  'set up',
  'configure',
  'write a function',
  'write a component',
  'fix the bug',
  'debug',
  'write tests for',
  'add tests',
  'api endpoint',
  'form validation',
  'write code',
  'code a',
  'make a',
  'develop',
  'scaffold',
  'generate',
  'tracker',
  'crud',
];

const LOW_COMPLEXITY = [
  'what is',
  'what are',
  'explain',
  'how does',
  'how do',
  'why does',
  'define',
  'describe',
  'list',
  'summarize',
  'translate',
  'convert',
  'format',
  'rename',
  'typo',
  'hello',
  'hey',
  'hi',
  'yo',
  'sup',
  'ok',
  'okay',
  'sure',
  'yes',
  'no',
  'thanks',
  'thank you',
  'bye',
  'cool',
  'nice',
  'wow',
  'hm',
  'umm',
  'huh',
  'lol',
];

const TOOL_KEYWORDS = [
  'read the file',
  'open the file',
  'write to',
  'create a file',
  'delete',
  'run the command',
  'execute',
  'deploy',
  'install',
  'commit',
  'push',
  'pull',
  'search for',
  'find in',
  'grep',
  'ls',
  'cat',
  'mkdir',
  'npm',
  'pnpm',
  'git',
  'curl',
  'browse',
  'fetch',
];

/** Keywords that indicate coding / file-creation work */
const CODING_KEYWORDS = [
  'build',
  'create',
  'implement',
  'code',
  'write',
  'develop',
  'scaffold',
  'app',
  'website',
  'component',
  'function',
  'module',
  'endpoint',
  'feature',
  'script',
  'program',
  'tracker',
  'page',
];

const PRECISION_KEYWORDS = [
  'exact',
  'precise',
  'careful',
  'security',
  'critical',
  'production',
  'sensitive',
  'financial',
  'medical',
  'legal',
  'compliance',
  'audit',
  'encryption',
  'authorization',
];

const SPEED_KEYWORDS = [
  'quick',
  'fast',
  'brief',
  'short',
  'simple',
  'one-liner',
  'just tell me',
  'tldr',
  'eli5',
  'in a nutshell',
  'snippet',
  'cheat sheet',
];

// ─── Classifier ────────────────────────────────────────────────

export class TaskClassifier {
  /**
   * Classify an inbound message across 6 axes.
   * All numeric values are normalized 0-1 (except tokenEstimate).
   */
  classify(content: string, context: ClassifierContext): TaskClassification {
    const lower = content.toLowerCase();

    const result = {
      complexity: this.scoreComplexity(lower),
      tokenEstimate: this.estimateOutputTokens(lower),
      contextNeeds: this.scoreContextNeeds(context),
      precisionRequired: this.scorePrecision(lower),
      toolUsage: this.detectToolUsage(lower, context),
      speedPriority: this.scoreSpeed(lower),
    };

    log.debug('Classification result', {
      inputLength: content.length,
      complexity: result.complexity,
      tokenEstimate: result.tokenEstimate,
      contextNeeds: result.contextNeeds,
      precisionRequired: result.precisionRequired,
      toolUsage: result.toolUsage,
      speedPriority: result.speedPriority,
      sessionTokens: context.tokenCount,
    });

    return result;
  }

  // ── Private scorers ────────────────────────────────────────

  private scoreComplexity(lower: string): number {
    const highHits = this.countMatches(lower, HIGH_COMPLEXITY);
    const medHits = this.countMatches(lower, MEDIUM_COMPLEXITY);
    const lowHits = this.countMatches(lower, LOW_COMPLEXITY);

    // Length-based bonus (longer prompts tend to be more complex)
    const lengthBonus = Math.min(lower.length / 2000, 0.3);

    // Coding floor — coding tasks should never drop to haiku (< 0.4)
    const codingHits = this.countMatches(lower, CODING_KEYWORDS);
    const codingFloor = codingHits >= 2 ? 0.4 : 0;

    if (highHits > 0) return Math.min(0.7 + highHits * 0.1 + lengthBonus, 1);
    if (medHits > 0)
      return Math.max(codingFloor, Math.min(0.35 + medHits * 0.08 + lengthBonus, 0.75));
    if (lowHits > 0) return Math.max(codingFloor, Math.max(0.1, 0.25 - lowHits * 0.05));

    // Default: moderate complexity (apply coding floor)
    return Math.max(codingFloor, Math.min(0.4 + lengthBonus, 0.7));
  }

  private estimateOutputTokens(lower: string): number {
    const inputLength = lower.length;

    // Short queries → short answers (usually)
    if (inputLength < 50) return 200;
    if (inputLength < 200) return 800;
    if (inputLength < 500) return 2000;

    // Long, complex prompts → long answers
    return Math.min(inputLength * 4, 8000);
  }

  private scoreContextNeeds(context: ClassifierContext): number {
    // Ratio of used context window (200k max)
    return Math.min(context.tokenCount / 200_000, 1);
  }

  private scorePrecision(lower: string): number {
    const hits = this.countMatches(lower, PRECISION_KEYWORDS);
    return Math.min(0.3 + hits * 0.15, 1);
  }

  private detectToolUsage(lower: string, context: ClassifierContext): boolean {
    if (context.hasActiveTools) return true;
    return TOOL_KEYWORDS.some((kw) => lower.includes(kw));
  }

  private scoreSpeed(lower: string): number {
    const hits = this.countMatches(lower, SPEED_KEYWORDS);
    if (hits > 0) return Math.min(0.5 + hits * 0.15, 1);

    // Short messages have implicit speed priority
    if (lower.length < 30) return 0.6;
    return 0.3;
  }

  // ── Helpers ────────────────────────────────────────────────

  private countMatches(text: string, keywords: string[]): number {
    return keywords.reduce((count, kw) => count + (text.includes(kw) ? 1 : 0), 0);
  }
}
