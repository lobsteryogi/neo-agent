/**
 * ░▒▓ STRING UTILITIES ▓▒░
 *
 * "I'm trying to free your mind."
 */

/**
 * Strips leading/trailing markdown code fences from a string.
 * Handles ```json, ```markdown, ```yaml, ```md, and plain ```.
 */
export function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:json|markdown|yaml|md)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}
