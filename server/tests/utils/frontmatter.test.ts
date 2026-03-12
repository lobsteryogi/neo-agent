import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../../src/utils/frontmatter.js';

describe('frontmatter — parseFrontmatter', () => {
  it('parses simple key-value frontmatter', () => {
    const raw = `---
title: Hello World
author: Neo
---
Body content here.`;
    const result = parseFrontmatter(raw);
    expect(result.frontmatter).toEqual({ title: 'Hello World', author: 'Neo' });
    expect(result.body).toBe('Body content here.');
  });

  it('parses YAML array values', () => {
    const raw = `---
tags: [javascript, typescript, node]
---
Some body.`;
    const result = parseFrontmatter(raw);
    expect(result.frontmatter.tags).toEqual(['javascript', 'typescript', 'node']);
    expect(result.body).toBe('Some body.');
  });

  it('returns empty frontmatter when no fences are present', () => {
    const raw = 'Just a plain markdown file.';
    const result = parseFrontmatter(raw);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe(raw);
  });

  it('returns empty frontmatter for missing closing fence', () => {
    const raw = `---
title: Unclosed
This is body text without a closing fence.`;
    const result = parseFrontmatter(raw);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe(raw);
  });

  it('handles empty frontmatter block', () => {
    const raw = `---

---
Body after empty frontmatter.`;
    const result = parseFrontmatter(raw);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe('Body after empty frontmatter.');
  });

  it('handles empty body', () => {
    const raw = `---
key: value
---
`;
    const result = parseFrontmatter(raw);
    expect(result.frontmatter).toEqual({ key: 'value' });
    expect(result.body).toBe('');
  });

  it('handles values containing colons', () => {
    const raw = `---
url: https://example.com
time: 12:30:00
---
Body.`;
    const result = parseFrontmatter(raw);
    expect(result.frontmatter.url).toBe('https://example.com');
    expect(result.frontmatter.time).toBe('12:30:00');
    expect(result.body).toBe('Body.');
  });

  it('skips lines without colons in frontmatter', () => {
    const raw = `---
title: Hello
no colon here is ignored wait it has one
standalone
---
Body.`;
    const result = parseFrontmatter(raw);
    expect(result.frontmatter.title).toBe('Hello');
    // "no colon here is ignored wait it has one" has a colon at "no colon..."
    // actually "no colon here is ignored wait it has one" — no colon? Let me re-check.
    // It doesn't have a colon, so it should be skipped. But "standalone" also has no colon.
    expect(result.frontmatter).not.toHaveProperty('standalone');
    expect(result.body).toBe('Body.');
  });

  it('skips lines where key is empty', () => {
    const raw = `---
: no key
valid: yes
---
Body.`;
    const result = parseFrontmatter(raw);
    expect('' in result.frontmatter).toBe(false);
    expect(result.frontmatter.valid).toBe('yes');
  });

  it('handles empty YAML array', () => {
    const raw = `---
tags: []
---
Body.`;
    const result = parseFrontmatter(raw);
    expect(result.frontmatter.tags).toEqual([]);
  });

  it('handles YAML array with single element', () => {
    const raw = `---
tags: [solo]
---
Body.`;
    const result = parseFrontmatter(raw);
    expect(result.frontmatter.tags).toEqual(['solo']);
  });

  it('trims whitespace in YAML array elements', () => {
    const raw = `---
tags: [ spaced , out , values ]
---
Body.`;
    const result = parseFrontmatter(raw);
    expect(result.frontmatter.tags).toEqual(['spaced', 'out', 'values']);
  });

  it('filters empty strings from YAML arrays', () => {
    const raw = `---
tags: [a, , b, , c]
---
Body.`;
    const result = parseFrontmatter(raw);
    expect(result.frontmatter.tags).toEqual(['a', 'b', 'c']);
  });

  it('handles multiline body content', () => {
    const raw = `---
title: Multi
---
Line one.

Line three.
Line four.`;
    const result = parseFrontmatter(raw);
    expect(result.frontmatter.title).toBe('Multi');
    expect(result.body).toBe('Line one.\n\nLine three.\nLine four.');
  });

  it('returns raw as body for empty string input', () => {
    const result = parseFrontmatter('');
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe('');
  });

  it('handles value with empty string', () => {
    const raw = `---
key:
---
Body.`;
    const result = parseFrontmatter(raw);
    expect(result.frontmatter.key).toBe('');
    expect(result.body).toBe('Body.');
  });

  it('trims keys and values', () => {
    const raw = `---
  padded  :  value with spaces
---
Body.`;
    const result = parseFrontmatter(raw);
    expect(result.frontmatter['padded']).toBe('value with spaces');
  });
});
