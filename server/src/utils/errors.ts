/**
 * ░▒▓ ERROR UTILITIES ▓▒░
 *
 * "There's a difference between knowing the path and walking the path."
 */

/** Extract a human-readable message from an unknown caught value. */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
