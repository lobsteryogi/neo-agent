/**
 * ░▒▓ COMMAND REGISTRY ▓▒░
 *
 * "I know Kung Fu."
 *
 * Single source of truth for all slash commands.
 * Used by both CLI and Telegram channels.
 */

export interface CommandDef {
  command: string;
  args?: string; // e.g. '<name>', '<query>', '[profile]'
  description: string;
  channels: Array<'cli' | 'telegram' | 'web'>;
}

export const COMMANDS: CommandDef[] = [
  {
    command: '/session',
    args: '<name>',
    description: 'Switch/create session',
    channels: ['cli', 'telegram'],
  },
  { command: '/sessions', description: 'List all sessions', channels: ['cli', 'telegram'] },
  { command: '/stats', description: 'Current session stats', channels: ['cli', 'telegram'] },
  {
    command: '/route',
    args: '[profile]',
    description: 'View/switch routing',
    channels: ['cli', 'telegram'],
  },
  {
    command: '/memory',
    args: '<query>',
    description: 'Search memories',
    channels: ['cli', 'telegram'],
  },
  {
    command: '/remember',
    args: '<fact>',
    description: 'Store a memory',
    channels: ['cli', 'telegram'],
  },
  { command: '/new', description: 'Fresh session', channels: ['cli', 'telegram'] },
  { command: '/compact', description: 'Compact session context', channels: ['cli', 'telegram'] },
  { command: '/retry', description: 'Resend last message', channels: ['cli', 'telegram'] },
  {
    command: '/model',
    args: '<haiku|sonnet|opus>',
    description: 'Force model for next turn only',
    channels: ['cli', 'telegram'],
  },
  {
    command: '/export',
    description: 'Export session transcript to markdown',
    channels: ['cli', 'telegram'],
  },
  {
    command: '/debug',
    args: '[namespace]',
    description: 'Show recent debug logs',
    channels: ['cli', 'telegram'],
  },
  { command: '/onboard', description: 'Re-configure agent', channels: ['cli'] },
  { command: '/clear', description: 'Clear terminal', channels: ['cli'] },
  { command: '/tasks', description: 'List tasks by status', channels: ['cli', 'telegram'] },
  {
    command: '/task',
    args: '<title>',
    description: 'Quick-create task in backlog',
    channels: ['cli', 'telegram'],
  },
  {
    command: '/dev',
    args: '[on|off]',
    description: 'Toggle self-edit mode (neo-agent codebase)',
    channels: ['cli', 'telegram'],
  },
  { command: '/brag', description: 'Show off what Neo can do', channels: ['cli', 'telegram'] },
  { command: '/help', description: 'Show available commands', channels: ['cli', 'telegram'] },
  { command: '/exit', description: 'Disconnect from the Matrix', channels: ['cli'] },
];

/** Get commands filtered by channel */
export function getCommandsForChannel(channel: 'cli' | 'telegram' | 'web'): CommandDef[] {
  return COMMANDS.filter((c) => c.channels.includes(channel));
}

/** Format commands as plain text (for Telegram) */
export function formatCommandsText(channel: 'cli' | 'telegram' | 'web'): string {
  const cmds = getCommandsForChannel(channel);
  const maxLen = Math.max(
    ...cmds.map((c) => {
      const full = c.args ? `${c.command} ${c.args}` : c.command;
      return full.length;
    }),
  );

  return cmds
    .map((c) => {
      const full = c.args ? `${c.command} ${c.args}` : c.command;
      return `${full.padEnd(maxLen)}  — ${c.description}`;
    })
    .join('\n');
}
