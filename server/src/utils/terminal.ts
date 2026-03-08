/**
 * ░▒▓ THE MATRIX TERMINAL ▓▒░
 *
 * Terminal styling utilities for the Neo-Agent CLI.
 * Green phosphor, digital rain, and existential dread.
 */

// ─── ANSI Color Codes ──────────────────────────────────────────

const ESC = '\x1b[';
const RESET = `${ESC}0m`;

export const color = {
  // Matrix greens
  green: (s: string) => `${ESC}32m${s}${RESET}`,
  brightGreen: (s: string) => `${ESC}92m${s}${RESET}`,
  darkGreen: (s: string) => `${ESC}2;32m${s}${RESET}`,

  // Accent colors
  cyan: (s: string) => `${ESC}36m${s}${RESET}`,
  yellow: (s: string) => `${ESC}33m${s}${RESET}`,
  red: (s: string) => `${ESC}31m${s}${RESET}`,
  white: (s: string) => `${ESC}97m${s}${RESET}`,
  dim: (s: string) => `${ESC}2m${s}${RESET}`,
  bold: (s: string) => `${ESC}1m${s}${RESET}`,
  italic: (s: string) => `${ESC}3m${s}${RESET}`,

  // Matrix special
  matrix: (s: string) => `${ESC}1;32m${s}${RESET}`, // Bold green
  phosphor: (s: string) => `${ESC}38;5;46m${s}${RESET}`, // Bright Matrix green (#00ff00)
  darkPhosphor: (s: string) => `${ESC}38;5;22m${s}${RESET}`, // Dark green glow
  amber: (s: string) => `${ESC}38;5;208m${s}${RESET}`, // Warning amber
  neonCyan: (s: string) => `${ESC}38;5;51m${s}${RESET}`, // Neon cyan
};

// ─── Matrix ASCII Art ──────────────────────────────────────────

export const NEO_BANNER = `
${color.phosphor('  ███╗   ██╗███████╗ ██████╗       █████╗  ██████╗ ███████╗███╗   ██╗████████╗')}
${color.brightGreen('  ████╗  ██║██╔════╝██╔═══██╗     ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝')}
${color.green('  ██╔██╗ ██║█████╗  ██║   ██║     ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   ')}
${color.darkGreen('  ██║╚██╗██║██╔══╝  ██║   ██║     ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   ')}
${color.darkPhosphor('  ██║ ╚████║███████╗╚██████╔╝     ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   ')}
${color.dim('  ╚═╝  ╚═══╝╚══════╝ ╚═════╝      ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   ')}
`;

export const WAKE_UP_ART = `${color.phosphor(`
    ╦ ╦╔═╗╦╔═╔═╗  ╦ ╦╔═╗    ╔╗╔╔═╗╔═╗
    ║║║╠═╣╠╩╗║╣   ║ ║╠═╝    ║║║║╣ ║ ║
    ╚╩╝╩ ╩╩ ╩╚═╝  ╚═╝╩  ╩   ╝╚╝╚═╝╚═╝`)}`;

export const MATRIX_DIVIDER = color.darkGreen(
  '  ─────────────────────────────────────────────────────',
);
export const MATRIX_DIVIDER_LONG = color.darkGreen(
  '  ══════════════════════════════════════════════════════════════════',
);

// ─── Digital Rain Effect ───────────────────────────────────────

const MATRIX_CHARS = 'ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ012345789:.=*+-<>¦|_';

function randomMatrixChar(): string {
  return MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
}

export function digitalRain(lines: number = 4, width: number = 60): string {
  const result: string[] = [];
  for (let y = 0; y < lines; y++) {
    let line = '  ';
    for (let x = 0; x < width; x++) {
      const brightness = Math.random();
      const char = randomMatrixChar();
      if (brightness > 0.85) {
        line += color.phosphor(char);
      } else if (brightness > 0.6) {
        line += color.brightGreen(char);
      } else if (brightness > 0.3) {
        line += color.green(char);
      } else {
        line += color.darkGreen(char);
      }
    }
    result.push(line);
  }
  return result.join('\n');
}

// ─── Typing Effect ─────────────────────────────────────────────

export async function typeText(text: string, speed: number = 30): Promise<void> {
  for (const char of text) {
    process.stdout.write(color.phosphor(char));
    await sleep(speed);
  }
  process.stdout.write('\n');
}

export async function typeLines(lines: string[], speed: number = 20): Promise<void> {
  for (const line of lines) {
    await typeText(line, speed);
    await sleep(100);
  }
}

// ─── Matrix-Styled Boxes ───────────────────────────────────────

export function matrixBox(
  title: string,
  content: string[],
  style: 'success' | 'warning' | 'error' | 'info' = 'info',
): string {
  const colorFn =
    style === 'success'
      ? color.phosphor
      : style === 'warning'
        ? color.amber
        : style === 'error'
          ? color.red
          : color.neonCyan;

  const maxLen = Math.max(title.length, ...content.map((l) => stripAnsi(l).length)) + 4;
  const width = Math.max(maxLen, 40);

  const top = colorFn(`  ┌${'─'.repeat(width)}┐`);
  const titleLine = colorFn(`  │ ${color.bold(title)}${' '.repeat(width - title.length - 1)}│`);
  const separator = colorFn(`  ├${'─'.repeat(width)}┤`);
  const bottom = colorFn(`  └${'─'.repeat(width)}┘`);

  const contentLines = content.map((line) => {
    const stripped = stripAnsi(line);
    const padding = width - stripped.length - 1;
    return colorFn('  │ ') + line + ' '.repeat(Math.max(0, padding)) + colorFn('│');
  });

  return [top, titleLine, separator, ...contentLines, bottom].join('\n');
}

// ─── Status Indicators ────────────────────────────────────────

export const status = {
  ok: (msg: string) => `  ${color.phosphor('▓')} ${color.green(msg)}`,
  warn: (msg: string) => `  ${color.amber('▒')} ${color.yellow(msg)}`,
  fail: (msg: string) => `  ${color.red('░')} ${color.red(msg)}`,
  info: (msg: string) => `  ${color.neonCyan('●')} ${color.cyan(msg)}`,
  step: (n: number, msg: string) => `  ${color.darkGreen(`[${n}]`)} ${color.green(msg)}`,
};

// ─── Matrix Quotes ─────────────────────────────────────────────

const MATRIX_QUOTES = [
  'The Matrix has you...',
  'Follow the white rabbit.',
  'There is no spoon.',
  'I know kung fu.',
  'Free your mind.',
  'Welcome to the real world.',
  'What is real? How do you define real?',
  'I can only show you the door. You have to walk through it.',
  'You take the red pill, you stay in Wonderland.',
  'Unfortunately, no one can be told what the Matrix is. You have to see it for yourself.',
  'I know why you are here. I know what you have been doing.',
  "What you know you can't explain, but you feel it.",
  "Don't think you are. Know you are.",
  'Everything that has a beginning has an end.',
  'The answer is out there. It is looking for you.',
  'You have been living in a dream world.',
  'Do not try and bend the spoon. Instead, only try to realize the truth... there is no spoon.',
  'Choice. The problem is choice.',
  'To deny our own impulses is to deny the very thing that makes us human.',
];

export function randomQuote(): string {
  return MATRIX_QUOTES[Math.floor(Math.random() * MATRIX_QUOTES.length)];
}

// ─── Helpers ───────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

// ─── Progress Bar ──────────────────────────────────────────────

export function matrixProgress(label: string, current: number, total: number): string {
  const pct = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * 30);
  const bar = color.phosphor('█'.repeat(filled)) + color.darkGreen('░'.repeat(30 - filled));
  return `  ${color.green(label)} [${bar}] ${color.brightGreen(`${pct}%`)}`;
}

// ─── Section Header ────────────────────────────────────────────

export function sectionHeader(title: string): string {
  return `\n${MATRIX_DIVIDER}\n  ${color.matrix(`▸ ${title}`)}\n${MATRIX_DIVIDER}`;
}
