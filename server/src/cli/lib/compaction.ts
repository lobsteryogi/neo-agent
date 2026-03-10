/**
 * ░▒▓ CONTEXT COMPACTION ▓▒░
 *
 * "Free your mind."
 *
 * Summarizes older conversation messages while keeping recent ones verbatim.
 * Injects the compacted context into the system prompt until absorbed by the SDK session.
 */

import type { ClaudeBridge } from '../../core/claude-bridge.js';
import type { SessionTranscript } from '../../memory/index.js';
import { logger } from '../../utils/logger.js';
import { color } from '../../utils/terminal.js';
import type { SessionManager } from './sessions.js';

const log = logger('compaction');

export interface CompactionInfo {
  summarized: number;
  kept: number;
}

export class CompactionManager {
  compactedContext: string | null = null;
  lastCompactionInfo: CompactionInfo | null = null;

  private keepRecent: number;
  private autoCompactThreshold: number;

  constructor(
    private bridge: ClaudeBridge,
    private sessionMgr: SessionManager,
    private transcript: SessionTranscript,
    private workspace: string,
    private refreshSystemPrompt: () => void,
    opts?: { keepRecent?: number; autoCompactThreshold?: number },
  ) {
    this.keepRecent = opts?.keepRecent ?? 20;
    this.autoCompactThreshold = opts?.autoCompactThreshold ?? 15;
  }

  get autoCompactTurnThreshold(): number {
    return this.autoCompactThreshold;
  }

  /**
   * Generate a compacted summary from conversation history.
   */
  async generateCompactSummary(
    messagesToCompact: { role: string; content: string }[],
    silent = false,
  ): Promise<string | null> {
    const conversationText = messagesToCompact
      .map((m) => `[${m.role}]: ${m.content.slice(0, 10000)}`)
      .join('\n\n');

    const compactPrompt = `You are compacting a conversation to reduce context size while preserving all important information.

Produce a structured summary with these sections (skip empty sections):

## Conversation Summary
A 2-3 sentence overview of what was discussed.

## Key Decisions & Outcomes
- Bullet each decision, outcome, or conclusion reached

## Technical Context
- Current project/codebase details established
- File paths, configurations, or architecture discussed
- Code changes made or planned

## User Preferences & Style
- Communication preferences, tool preferences, workflow patterns

## Active Tasks & Open Items
- What was being worked on
- Unresolved questions or next steps

## Important Facts
- Any facts, credentials, names, or specifics that would be needed to continue

Be thorough — aim for ~60% of the original length. Preserve ALL specific details: names, URLs, paths, values, error messages, topics discussed, tools mentioned. Do NOT generalize or drop anything that was explicitly stated.

<conversation>
${conversationText}
</conversation>`;

    try {
      const result = await this.bridge.run(compactPrompt, {
        cwd: this.workspace,
        model: 'sonnet',
        maxTurns: 1,
        timeoutMs: 60_000,
        systemPrompt:
          'You are a context compaction assistant. Produce structured, detailed summaries that preserve all actionable information. Never omit specific values, paths, or technical details. Output only the summary.',
      });

      if (!result.success || !result.data) {
        if (!silent) log.warn('Compaction failed', { error: result.error });
        return null;
      }

      const summary =
        typeof result.data === 'string' ? result.data : ((result.data as any).content ?? '');
      return summary || null;
    } catch (err) {
      log.error('Compaction error', { error: String(err) });
      return null;
    }
  }

  /**
   * Manual /compact command — compacts the full conversation.
   */
  async runCompact(): Promise<void> {
    const s = this.sessionMgr.current;
    const beforeTokens = s.totalInputTokens + s.totalOutputTokens;

    if (beforeTokens === 0) {
      console.log();
      console.log(`  ${color.dim('Nothing to compact — no conversation yet.')}`);
      console.log();
      return;
    }

    const history = this.transcript.getHistory(s.id, 200);
    if (history.length === 0) {
      console.log();
      console.log(`  ${color.dim('No transcript found to compact.')}`);
      console.log();
      return;
    }

    console.log();
    process.stdout.write(`  ${color.darkGreen('⚙')} ${color.dim('Compacting context...')}`);
    log.debug('Manual compact start', {
      turns: s.turns,
      tokens: beforeTokens,
      messageCount: history.length,
    });

    // Split: summarize older messages, keep recent ones verbatim
    const keepCount = Math.min(this.keepRecent, history.length);
    const olderMessages = history.slice(0, -keepCount);
    const recentMessages = history.slice(-keepCount);

    let summary: string | null = null;

    if (olderMessages.length > 0) {
      summary = await this.generateCompactSummary(olderMessages);
    }

    // Build the compacted context: summary + recent verbatim
    const parts: string[] = [];

    if (summary) {
      parts.push(summary);
    }

    if (recentMessages.length > 0) {
      parts.push('\n## Recent Messages (verbatim)\n');
      for (const m of recentMessages) {
        const truncated = m.content.length > 3000 ? m.content.slice(0, 3000) + '...' : m.content;
        parts.push(`**${m.role}**: ${truncated}\n`);
      }
    }

    this.compactedContext = parts.join('\n');
    this.lastCompactionInfo = { summarized: olderMessages.length, kept: recentMessages.length };

    // Break SDK session — next turn starts fresh with compacted context
    s.sdkSessionId = undefined;
    this.sessionMgr.save(s);
    this.refreshSystemPrompt();

    const afterEstimate = Math.ceil(this.compactedContext.length / 4);
    process.stdout.write(
      `\r\x1b[K  ${color.green('▓')} Context compacted  ${color.darkGreen('⚡')}  ${color.dim(`${beforeTokens.toLocaleString()} tokens → ~${afterEstimate.toLocaleString()} token summary`)}\n`,
    );
    if (olderMessages.length > 0) {
      console.log(
        color.dim(
          `    ${olderMessages.length} older messages summarized, ${recentMessages.length} recent kept verbatim.`,
        ),
      );
    } else {
      console.log(
        color.dim(`    ${recentMessages.length} messages kept verbatim (too few to summarize).`),
      );
    }
    console.log(color.dim('    Next message continues with compacted context.'));
    console.log();

    log.debug('Manual compact done', {
      olderSummarized: olderMessages.length,
      recentKept: recentMessages.length,
      summaryTokens: afterEstimate,
      originalTokens: beforeTokens,
      ratio: ((afterEstimate / beforeTokens) * 100).toFixed(1) + '%',
    });
  }

  /**
   * Auto-compact: triggered after N turns. Summarizes messages older than
   * the last keepRecent, injects summary into context, and breaks
   * the SDK session to start fresh with reduced tokens.
   */
  async autoCompactIfNeeded(): Promise<void> {
    const s = this.sessionMgr.current;
    if (s.turns < this.autoCompactThreshold) return;
    if (s.turns % this.autoCompactThreshold !== 0) return;

    const history = this.transcript.getHistory(s.id, 200);
    if (history.length <= this.keepRecent) return;

    log.debug('Auto-compact triggered', { turns: s.turns, messageCount: history.length });
    process.stdout.write(`\n  ${color.darkGreen('⚙')} ${color.dim('Auto-compacting context...')}`);

    const olderMessages = history.slice(0, -this.keepRecent);

    // If we already have a compacted context, include it as prior context for the summarizer
    const messagesToSummarize = this.compactedContext
      ? [
          { role: 'system' as string, content: `[Previous summary]:\n${this.compactedContext}` },
          ...olderMessages,
        ]
      : olderMessages;

    const summary = await this.generateCompactSummary(messagesToSummarize, true);

    if (!summary) {
      process.stdout.write(`\r\x1b[K`);
      log.warn('Auto-compact failed — continuing without compaction');
      return;
    }

    const recentMessages = history.slice(-this.keepRecent);
    const parts: string[] = [summary, '\n## Recent Messages (verbatim)\n'];
    for (const m of recentMessages) {
      const truncated = m.content.length > 3000 ? m.content.slice(0, 3000) + '...' : m.content;
      parts.push(`**${m.role}**: ${truncated}\n`);
    }

    const beforeTokens = s.totalInputTokens + s.totalOutputTokens;
    this.compactedContext = parts.join('\n');
    const afterEstimate = Math.ceil(this.compactedContext.length / 4);
    this.lastCompactionInfo = { summarized: olderMessages.length, kept: this.keepRecent };

    // Break SDK session
    s.sdkSessionId = undefined;
    this.sessionMgr.save(s);

    process.stdout.write(
      `\r\x1b[K  ${color.green('▓')} Auto-compacted  ${color.darkGreen('⚡')}  ${color.dim(`${olderMessages.length} older turns summarized, ${this.keepRecent} recent kept`)}\n`,
    );

    log.debug('Auto-compact done', {
      olderSummarized: olderMessages.length,
      recentKept: this.keepRecent,
      summaryTokens: afterEstimate,
      originalTokens: beforeTokens,
      ratio: beforeTokens > 0 ? ((afterEstimate / beforeTokens) * 100).toFixed(1) + '%' : 'N/A',
    });
  }
}
