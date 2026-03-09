/**
 * ░▒▓ THE MATRIX TERMINAL ▓▒░
 *
 * Terminal styling utilities for the Neo-Agent CLI.
 * Green phosphor, digital rain, and existential dread.
 */

// ─── ANSI Color Codes ──────────────────────────────────────────

const ESC = '\x1b[';
const RESET = `${ESC}0m`;

/** Apply 24-bit RGB foreground color. */
export function rgb(r: number, g: number, b: number): (s: string) => string {
  return (s: string) => `${ESC}38;2;${r};${g};${b}m${s}${RESET}`;
}

/** Apply 24-bit RGB background color. */
export function bgRgb(r: number, g: number, b: number): (s: string) => string {
  return (s: string) => `${ESC}48;2;${r};${g};${b}m${s}${RESET}`;
}

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
  underline: (s: string) => `${ESC}4m${s}${RESET}`,

  // Matrix special
  matrix: (s: string) => `${ESC}1;32m${s}${RESET}`, // Bold green
  phosphor: (s: string) => `${ESC}38;5;46m${s}${RESET}`, // Bright Matrix green (#00ff00)
  darkPhosphor: (s: string) => `${ESC}38;5;22m${s}${RESET}`, // Dark green glow
  amber: (s: string) => `${ESC}38;5;208m${s}${RESET}`, // Warning amber
  neonCyan: (s: string) => `${ESC}38;5;51m${s}${RESET}`, // Neon cyan

  // Cyberpunk accents
  magenta: (s: string) => `${ESC}38;2;255;0;128m${s}${RESET}`,
  electricBlue: (s: string) => `${ESC}38;2;0;170;255m${s}${RESET}`,
  hotPink: (s: string) => `${ESC}38;2;255;105;180m${s}${RESET}`,
  neonPurple: (s: string) => `${ESC}38;2;180;0;255m${s}${RESET}`,
  neonYellow: (s: string) => `${ESC}38;2;220;255;0m${s}${RESET}`,
  dimCyan: (s: string) => `${ESC}2;36m${s}${RESET}`,
};

// ─── Gradient Text ─────────────────────────────────────────────

/** Render text with a smooth left-to-right RGB gradient. */
export function gradient(
  text: string,
  from: [number, number, number],
  to: [number, number, number],
): string {
  const len = text.length;
  if (len === 0) return '';
  if (len === 1) return rgb(from[0], from[1], from[2])(text);
  return (
    text
      .split('')
      .map((ch, i) => {
        const t = i / (len - 1);
        const r = Math.round(from[0] + (to[0] - from[0]) * t);
        const g = Math.round(from[1] + (to[1] - from[1]) * t);
        const b = Math.round(from[2] + (to[2] - from[2]) * t);
        return `${ESC}38;2;${r};${g};${b}m${ch}`;
      })
      .join('') + RESET
  );
}

// ─── Matrix Spinner ────────────────────────────────────────────

const MATRIX_SPINNER_CHARS = 'ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘ';

/** Cyberpunk spinner frames — Matrix katakana cycling through green shades. */
export function getSpinnerFrame(idx: number): string {
  const ch = MATRIX_SPINNER_CHARS[idx % MATRIX_SPINNER_CHARS.length];
  const colorFns = [color.phosphor, color.brightGreen, color.green, color.neonCyan];
  const colorFn = colorFns[idx % colorFns.length];
  return colorFn(ch);
}

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
  const titleLine = colorFn(
    `  │ ${color.bold(title)}${' '.repeat(Math.max(0, width - stripAnsi(title).length - 1))}│`,
  );
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
// Centralized in ../data/matrix-quotes.ts

export { randomQuote } from '../data/matrix-quotes.js';

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
