/**
 * ░▒▓ FRONTMATTER PARSER ▓▒░
 *
 * "I know kung fu." — Shared YAML frontmatter parser for .md files.
 */

export interface ParsedFrontmatter {
  frontmatter: Record<string, any>;
  body: string;
}

const FENCE_REGEX = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;

/**
 * Parse YAML-style frontmatter from a raw markdown string.
 * Handles simple key: value pairs and inline YAML arrays [a, b, c].
 */
export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const match = raw.match(FENCE_REGEX);
  if (!match) return { frontmatter: {}, body: raw };

  const frontmatter: Record<string, any> = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (!key) continue;

    // Parse YAML arrays: [tag1, tag2]
    if (value.startsWith('[') && value.endsWith(']')) {
      frontmatter[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body: match[2] };
}
