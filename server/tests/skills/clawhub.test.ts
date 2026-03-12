import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ClawHubClient,
  type ClawHubSearchResult,
  type ClawHubSkillBundle,
  type ClawHubSkillMeta,
} from '../../src/skills/clawhub';

describe('ClawHubClient', () => {
  let client: ClawHubClient;
  const mockFetch = vi.fn();

  beforeEach(() => {
    client = new ClawHubClient('https://test.clawhub.ai/api/v1');
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── Constructor ─────────────────────────────────────────────

  it('uses default base URL when none is provided', () => {
    const defaultClient = new ClawHubClient();
    // We can verify by calling search and checking the URL fetch receives
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [], total: 0 }),
    });

    defaultClient.search('test');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://clawhub.ai/api/v1/search'),
    );
  });

  it('uses a custom base URL when provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [], total: 0 }),
    });

    await client.search('test');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://test.clawhub.ai/api/v1/search'),
    );
  });

  // ── search() ────────────────────────────────────────────────

  describe('search()', () => {
    const mockResults: ClawHubSkillMeta[] = [
      {
        slug: 'code-review',
        name: 'Code Review',
        description: 'Reviews code',
        version: '1.0.0',
        tags: ['code'],
      },
      { slug: 'summarize', name: 'Summarize', description: 'Summarizes text', version: '2.0.0' },
    ];

    it('returns search results on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ results: mockResults, total: 2 }) satisfies ClawHubSearchResult,
      });

      const results = await client.search('code');

      expect(results).toEqual(mockResults);
      expect(results).toHaveLength(2);
    });

    it('URL-encodes the query parameter', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ results: [], total: 0 }),
      });

      await client.search('hello world & more');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('q=hello%20world%20%26%20more');
    });

    it('passes the limit parameter in the URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ results: [], total: 0 }),
      });

      await client.search('test', 10);

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('limit=10');
    });

    it('defaults limit to 5', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ results: [], total: 0 }),
      });

      await client.search('test');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('limit=5');
    });

    it('returns empty array when results field is missing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ total: 0 }),
      });

      const results = await client.search('test');
      expect(results).toEqual([]);
    });

    it('throws on non-OK response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(client.search('test')).rejects.toThrow(
        'ClawHub search failed: 500 Internal Server Error',
      );
    });

    it('throws on rate limit response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      await expect(client.search('test')).rejects.toThrow(
        'ClawHub search failed: 429 Too Many Requests',
      );
    });
  });

  // ── getSkill() ──────────────────────────────────────────────

  describe('getSkill()', () => {
    const mockSkill: ClawHubSkillMeta = {
      slug: 'code-review',
      name: 'Code Review',
      description: 'AI code reviewer',
      version: '3.1.0',
      tags: ['code', 'review'],
    };

    it('returns skill metadata on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockSkill,
      });

      const result = await client.getSkill('code-review');

      expect(result).toEqual(mockSkill);
    });

    it('constructs the correct URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockSkill,
      });

      await client.getSkill('code-review');

      expect(mockFetch).toHaveBeenCalledWith('https://test.clawhub.ai/api/v1/skills/code-review');
    });

    it('URL-encodes the slug', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockSkill,
      });

      await client.getSkill('my skill/test');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('skills/my%20skill%2Ftest');
    });

    it('returns null on 404', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const result = await client.getSkill('nonexistent');

      expect(result).toBeNull();
    });

    it('throws on non-404 error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      await expect(client.getSkill('test')).rejects.toThrow(
        'ClawHub getSkill failed: 503 Service Unavailable',
      );
    });
  });

  // ── download() ──────────────────────────────────────────────

  describe('download()', () => {
    const mockBundle: ClawHubSkillBundle = {
      slug: 'code-review',
      files: [
        { name: 'SKILL.md', content: '# Code Review\nReview code.' },
        { name: 'config.json', content: '{"model":"sonnet"}' },
      ],
    };

    it('returns skill bundle on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockBundle,
      });

      const result = await client.download('code-review');

      expect(result).toEqual(mockBundle);
      expect(result!.files).toHaveLength(2);
    });

    it('constructs the correct URL with encoded slug', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockBundle,
      });

      await client.download('my skill');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toBe('https://test.clawhub.ai/api/v1/download?slug=my%20skill');
    });

    it('returns null on 404', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const result = await client.download('nonexistent');

      expect(result).toBeNull();
    });

    it('throws on non-404 error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(client.download('test')).rejects.toThrow(
        'ClawHub download failed: 500 Internal Server Error',
      );
    });
  });

  // ── getFile() ───────────────────────────────────────────────

  describe('getFile()', () => {
    it('returns file content as text on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '# SKILL.md\nThis is the content.',
      });

      const result = await client.getFile('code-review', 'SKILL.md');

      expect(result).toBe('# SKILL.md\nThis is the content.');
    });

    it('constructs the correct URL with encoded slug and path', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => 'content',
      });

      await client.getFile('my-skill', 'src/main.ts');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toBe(
        'https://test.clawhub.ai/api/v1/skills/my-skill/file?path=src%2Fmain.ts',
      );
    });

    it('returns null on 404', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const result = await client.getFile('code-review', 'missing.txt');

      expect(result).toBeNull();
    });

    it('throws on non-404 error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      await expect(client.getFile('test', 'file.txt')).rejects.toThrow(
        'ClawHub getFile failed: 403 Forbidden',
      );
    });

    it('returns empty string when file is empty', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '',
      });

      const result = await client.getFile('code-review', 'empty.txt');

      expect(result).toBe('');
    });
  });

  // ── Network errors ──────────────────────────────────────────

  describe('network errors', () => {
    it('propagates fetch errors in search()', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(client.search('test')).rejects.toThrow('Failed to fetch');
    });

    it('propagates fetch errors in getSkill()', async () => {
      mockFetch.mockRejectedValue(new TypeError('Network error'));

      await expect(client.getSkill('test')).rejects.toThrow('Network error');
    });

    it('propagates fetch errors in download()', async () => {
      mockFetch.mockRejectedValue(new TypeError('Connection refused'));

      await expect(client.download('test')).rejects.toThrow('Connection refused');
    });

    it('propagates fetch errors in getFile()', async () => {
      mockFetch.mockRejectedValue(new TypeError('DNS resolution failed'));

      await expect(client.getFile('test', 'file.txt')).rejects.toThrow('DNS resolution failed');
    });
  });
});
