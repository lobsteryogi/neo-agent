/**
 * ░▒▓ SLASH COMMANDS ▓▒░
 *
 * "There is no spoon."
 *
 * All /slash command handlers for the chat REPL.
 */

import type { KANBAN_COLUMNS, ModelTier, RoutingProfile } from '@neo-agent/shared';
import { getCommandsForChannel } from '../../channels/command-registry.js';
import { getQuote } from '../../data/matrix-quotes.js';
import type { TaskRepo } from '../../db/task-repo.js';
import type { LongTermMemory, MemorySearch } from '../../memory/index.js';
import { getRecentLogs, type LogEntry } from '../../utils/logger.js';
import {
  color,
  digitalRain,
  gradient,
  matrixBox,
  status as statusIcon,
} from '../../utils/terminal.js';
import { buildBanner, buildPrompt, fmtCost, fmtTokens, sessionInfo } from './format.js';
import type { SessionManager } from './sessions.js';

// ─── Types ────────────────────────────────────────────────────

export interface CommandDeps {
  sessionMgr: SessionManager;
  longTermMemory: LongTermMemory;
  memorySearch: MemorySearch;
  routingProfile: RoutingProfile;
  setRoutingProfile: (p: RoutingProfile) => void;
  refreshSystemPrompt: () => void;
  rl: { setPrompt: (p: string) => void; prompt: () => void };
  compact: () => Promise<void>;
  retry: () => Promise<void>;
  setModelOverride: (m: ModelTier | null) => void;
  exportTranscript: () => Promise<void>;
  transcript?: unknown; // available for future use
  taskRepo?: TaskRepo;
}

// ─── Handler ──────────────────────────────────────────────────

/**
 * Handle a slash command. Returns `true` if the input was a command, `false` otherwise.
 */
export function handleCommand(input: string, deps: CommandDeps): boolean | Promise<boolean> {
  const { sessionMgr, longTermMemory, memorySearch, rl } = deps;
  const currentSession = sessionMgr.current;

  // ─── /exit, /quit ─────────────────────────────────────────
  if (input === '/exit' || input === '/quit') {
    console.log();
    console.log(`  ${sessionInfo(currentSession)}`);
    console.log(`  ${digitalRain(1, 52)}`);
    console.log(`  ${color.dim(color.italic(`"${getQuote('offeringTruth')}"`))}`);
    console.log();
    process.exit(0);
  }

  // ─── /clear ───────────────────────────────────────────────
  if (input === '/clear') {
    console.clear();
    console.log(buildBanner());
    console.log(`  ${sessionInfo(currentSession)}`);
    console.log();
    rl.prompt();
    return true;
  }

  // ─── /help ────────────────────────────────────────────────
  if (input === '/help') {
    const cmds = getCommandsForChannel('cli');
    const lines = cmds.map((c) => {
      const full = c.args ? `${c.command} ${c.args}` : c.command;
      const padded = full.padEnd(18);
      return `${color.neonCyan(padded)}${color.darkGreen('─')} ${c.description}`;
    });
    console.log();
    console.log(matrixBox('COMMANDS', lines, 'info'));
    console.log();
    rl.prompt();
    return true;
  }

  // ─── /stats ───────────────────────────────────────────────
  if (input === '/stats') {
    const memCount = longTermMemory.count();
    console.log();
    console.log(
      matrixBox(
        'SESSION STATS',
        [
          `${color.dim('Session:')}  ${color.neonCyan(currentSession.id)}`,
          `${color.dim('Turns:')}    ${color.green(String(currentSession.turns))}`,
          `${color.dim('Tokens:')}   ${color.brightGreen(fmtTokens(currentSession.totalInputTokens + currentSession.totalOutputTokens))}`,
          `${color.dim('Cost:')}     ${color.neonYellow(fmtCost(currentSession.totalCost))}`,
          `${color.dim('Router:')}   ${color.magenta(deps.routingProfile)}`,
          `${color.dim('Memories:')} ${color.electricBlue(String(memCount))} ${color.dim('in Déjà Vu')}`,
        ],
        'info',
      ),
    );
    console.log();
    rl.prompt();
    return true;
  }

  // ─── /route ───────────────────────────────────────────────
  if (input.startsWith('/route')) {
    const newProfile = input.slice(6).trim();
    if (!newProfile) {
      console.log();
      console.log(statusIcon.info(`Current: ${color.bold(deps.routingProfile)}`));
      console.log(color.dim('    Profiles: auto, eco, balanced, premium'));
      console.log(color.dim('    Usage: /route <profile>'));
      console.log();
    } else if (['auto', 'eco', 'balanced', 'premium'].includes(newProfile)) {
      deps.setRoutingProfile(newProfile as RoutingProfile);
      console.log();
      console.log(statusIcon.ok(`Routing → ${color.bold(newProfile)}`));
      console.log();
    } else {
      console.log();
      console.log(
        statusIcon.warn(`Unknown profile "${newProfile}". Use: auto, eco, balanced, premium`),
      );
      console.log();
    }
    rl.prompt();
    return true;
  }

  // ─── /memory ──────────────────────────────────────────────
  if (input.startsWith('/memory')) {
    const query = input.slice(7).trim();
    if (!query) {
      const recent = longTermMemory.getRecent(10);
      if (recent.length === 0) {
        console.log();
        console.log(statusIcon.info("No memories yet. Talk to me and I'll remember."));
        console.log();
      } else {
        console.log();
        console.log(`  ${gradient('Déjà Vu — Recent Memories', [0, 255, 65], [0, 200, 255])}`);
        for (const m of recent) {
          console.log(
            `  ${color.neonCyan(`[${m.type}]`)} ${color.dim((m as any).content?.slice(0, 80))}`,
          );
        }
        console.log();
      }
    } else {
      const results = memorySearch.search(query);
      if (results.length === 0) {
        console.log();
        console.log(statusIcon.info(`No memories match "${query}".`));
        console.log();
      } else {
        console.log();
        console.log(`  ${gradient(`Déjà Vu — "${query}"`, [0, 255, 65], [0, 200, 255])}`);
        for (const r of results) {
          console.log(
            `  ${color.electricBlue(`[${r.source}]`)} ${color.dim(r.content.slice(0, 80))}`,
          );
        }
        console.log();
      }
    }
    rl.prompt();
    return true;
  }

  // ─── /remember ────────────────────────────────────────────
  if (input.startsWith('/remember ')) {
    const fact = input.slice(10).trim();
    if (!fact) {
      console.log();
      console.log(statusIcon.info('Usage: /remember <fact to store>'));
      console.log();
    } else {
      longTermMemory.store({
        type: 'fact',
        content: fact,
        importance: 0.9,
        tags: [],
        sourceSession: currentSession.id,
      });
      deps.refreshSystemPrompt();
      console.log();
      console.log(statusIcon.ok(`Remembered: "${color.dim(fact.slice(0, 60))}"  💾`));
      console.log();
    }
    rl.prompt();
    return true;
  }

  // ─── /onboard ─────────────────────────────────────────────
  if (input === '/onboard') {
    console.log();
    console.log(statusIcon.info('Re-entering the construct...'));
    console.log();

    // Return a promise for the async import
    return (async () => {
      const { execSync } = await import('child_process');
      try {
        execSync('pnpm --filter @neo-agent/server run onboard', {
          stdio: 'inherit',
          cwd: process.cwd().replace(/\/server$/, ''),
        });
      } catch {
        // User may abort the wizard
      }
      console.log();
      console.log(statusIcon.ok('Config updated. Restart neo:chat to apply.'));
      console.log();
      rl.prompt();
      return true;
    })();
  }

  // ─── /sessions ────────────────────────────────────────────
  if (input === '/sessions') {
    console.log();
    console.log(`  ${gradient('Sessions', [0, 255, 65], [0, 200, 255])}`);
    for (const [id, s] of sessionMgr.all()) {
      const marker = id === currentSession.id ? color.phosphor(' ◀') : '';
      const idStr = id === currentSession.id ? color.neonCyan(id) : color.green(id);
      console.log(
        `  ${color.darkGreen('▸')} ${idStr} ${color.dim('—')} ${color.dim(`${s.turns} turns`)} ${color.dimCyan(`↑${fmtTokens(s.totalInputTokens)}`)} ${color.neonCyan(`↓${fmtTokens(s.totalOutputTokens)}`)} ${color.neonYellow(fmtCost(s.totalCost))}${marker}`,
      );
    }
    console.log();
    rl.prompt();
    return true;
  }

  // ─── /new ─────────────────────────────────────────────────
  if (input === '/new') {
    sessionMgr.create();
    rl.setPrompt(buildPrompt(sessionMgr.current.id));
    console.log();
    console.log(statusIcon.ok(`New session: ${color.neonCyan(sessionMgr.current.id)}`));
    console.log();
    rl.prompt();
    return true;
  }

  // ─── /compact ─────────────────────────────────────────────
  if (input === '/compact') {
    deps.compact().finally(() => rl.prompt());
    return true;
  }

  // ─── /debug ────────────────────────────────────────────────
  if (input.startsWith('/debug')) {
    const namespace = input.slice(6).trim() || undefined;
    const entries = getRecentLogs(50, namespace);
    if (entries.length === 0) {
      console.log();
      console.log(
        statusIcon.info(namespace ? `No logs for [${namespace}]` : 'No logs captured yet.'),
      );
      console.log();
    } else {
      const LEVEL_ICON: Record<string, string> = {
        debug: color.dim('●'),
        info: color.green('●'),
        warn: color.yellow('▲'),
        error: color.red('✗'),
      };
      console.log();
      console.log(
        `  ${gradient('Debug Trace' + (namespace ? ` — [${namespace}]` : ''), [0, 255, 65], [0, 200, 255])}`,
      );
      for (const e of entries) {
        const icon = LEVEL_ICON[e.level] || '·';
        const ts = color.dim(e.timestamp.slice(11, 23));
        const ns = color.cyan(`[${e.namespace}]`);
        const msg = e.message;
        const data =
          e.data && Object.keys(e.data).length > 0 ? color.dim(` ${JSON.stringify(e.data)}`) : '';
        console.log(`  ${icon} ${ts} ${ns} ${msg}${data}`);
      }
      console.log();
    }
    rl.prompt();
    return true;
  }

  // ─── /retry ───────────────────────────────────────────────
  if (input === '/retry') {
    deps.retry().catch(() => undefined);
    return true;
  }

  // ─── /model ───────────────────────────────────────────────
  if (input.startsWith('/model')) {
    const tier = input.slice(6).trim() as ModelTier;
    if (!tier) {
      console.log();
      console.log(statusIcon.info('Usage: /model <haiku|sonnet|opus>'));
      console.log(color.dim('    Forces the next message to use that model, then reverts.'));
      console.log();
      rl.prompt();
      return true;
    }
    if (!['haiku', 'sonnet', 'opus'].includes(tier)) {
      console.log();
      console.log(statusIcon.warn(`Unknown tier "${tier}". Use: haiku, sonnet, opus`));
      console.log();
      rl.prompt();
      return true;
    }
    deps.setModelOverride(tier);
    console.log();
    console.log(statusIcon.ok(`Next message → ${color.magenta(tier)} ${color.dim('(one-shot)')}`));
    console.log();
    rl.prompt();
    return true;
  }

  // ─── /export ──────────────────────────────────────────────
  if (input === '/export') {
    deps.exportTranscript().finally(() => rl.prompt());
    return true;
  }

  // ─── /session <name> ──────────────────────────────────────
  if (input.startsWith('/session ')) {
    const name = input.slice(9).trim();
    if (!name) {
      console.log();
      console.log(statusIcon.info('Usage: /session <name>'));
      console.log();
      rl.prompt();
      return true;
    }
    if (sessionMgr.has(name)) {
      sessionMgr.switchTo(name);
      console.log();
      console.log(
        statusIcon.ok(
          `Switched → ${color.neonCyan(name)} ${color.dim(`(${sessionMgr.current.turns} turns)`)}`,
        ),
      );
      console.log();
    } else {
      sessionMgr.create(name);
      console.log();
      console.log(statusIcon.ok(`Created → ${color.neonCyan(name)}`));
      console.log();
    }
    rl.setPrompt(buildPrompt(sessionMgr.current.id));
    rl.prompt();
    return true;
  }

  // ─── /tasks ─────────────────────────────────────────────
  if (input === '/tasks') {
    if (!deps.taskRepo) {
      console.log();
      console.log(statusIcon.warn('Task board not available (no task repo)'));
      console.log();
      rl.prompt();
      return true;
    }
    const tasks = deps.taskRepo.list();
    console.log();
    if (tasks.length === 0) {
      console.log(statusIcon.info('No tasks yet. Create one with /task <title>'));
    } else {
      const statusOrder = ['backlog', 'in_progress', 'review', 'done'] as const;
      const statusLabels: Record<string, string> = {
        backlog: 'Backlog',
        in_progress: 'In Progress',
        review: 'Review',
        done: 'Done',
      };
      for (const s of statusOrder) {
        const col = tasks.filter((t) => t.status === s);
        if (col.length === 0) continue;
        console.log(`  ${color.neonCyan(statusLabels[s])} ${color.dim(`(${col.length})`)}`);
        for (const t of col) {
          const pri =
            t.priority === 'critical'
              ? color.red('!')
              : t.priority === 'high'
                ? color.yellow('↑')
                : t.priority === 'low'
                  ? color.dim('↓')
                  : color.dim('·');
          console.log(`    ${pri} ${color.green(t.title)} ${color.dim(t.id.slice(0, 8))}`);
        }
      }
    }
    console.log();
    rl.prompt();
    return true;
  }

  // ─── /task <title> ─────────────────────────────────────
  if (input.startsWith('/task ')) {
    const title = input.slice(6).trim();
    if (!title) {
      console.log();
      console.log(statusIcon.info('Usage: /task <title>'));
      console.log();
      rl.prompt();
      return true;
    }
    if (!deps.taskRepo) {
      console.log();
      console.log(statusIcon.warn('Task board not available (no task repo)'));
      console.log();
      rl.prompt();
      return true;
    }
    const task = deps.taskRepo.create({ title, createdBy: 'user' });
    console.log();
    console.log(
      statusIcon.ok(
        `Task created: ${color.neonCyan(task.title)} ${color.dim(`[${task.id.slice(0, 8)}]`)}`,
      ),
    );
    console.log();
    rl.prompt();
    return true;
  }

  // Not a command
  return false;
}
