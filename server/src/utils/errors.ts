/**
 * ░▒▓ ERROR UTILITIES ▓▒░
 *
 * "There's a difference between knowing the path and walking the path."
 */

/** Extract a human-readable message from an unknown caught value. */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Parse JSON safely, returning a fallback on failure instead of throwing. */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
