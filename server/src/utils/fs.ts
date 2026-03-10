/**
 * ░▒▓ FS UTILITIES ▓▒░
 *
 * "There is no spoon." — Just a directory, waiting to exist.
 */

import { existsSync, mkdirSync } from 'fs';

/** Create a directory (and parents) if it doesn't already exist. */
export function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}
