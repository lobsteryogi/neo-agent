import { describe, expect, it } from 'vitest';
import { Architect } from '../../src/harness/architect';

describe('Architect (Structural Validation)', () => {
  const architect = new Architect();

  it('has the correct wrapper name', () => {
    expect(architect.name).toBe('Architect');
  });

  it('throws on null/undefined response', async () => {
    await expect(architect.process(null as any)).rejects.toThrow('empty response');
    await expect(architect.process(undefined as any)).rejects.toThrow('empty response');
  });

  it('falls through to JSON.stringify when content is empty string (falsy)', async () => {
    // Empty string is falsy, so extractContent skips it and falls to JSON.stringify
    const result = await architect.process({ content: '' });
    expect(result.validatedContent).toContain('content');
  });

  it('throws when response content is whitespace-only', async () => {
    await expect(architect.process({ content: '   \n\t  ' })).rejects.toThrow('no text content');
  });

  it('validates a response with direct content string', async () => {
    const result = await architect.process({ content: 'Hello, world!' });
    expect(result.validatedContent).toBe('Hello, world!');
  });

  it('extracts content from data.content', async () => {
    const result = await architect.process({ data: { content: 'Nested content' } });
    expect(result.validatedContent).toBe('Nested content');
  });

  it('extracts content from data.result', async () => {
    const result = await architect.process({ data: { result: 'Result value' } });
    expect(result.validatedContent).toBe('Result value');
  });

  it('extracts content from validatedContent field', async () => {
    const result = await architect.process({ validatedContent: 'Already validated' });
    expect(result.validatedContent).toBe('Already validated');
  });

  it('falls back to JSON.stringify for unknown response shapes', async () => {
    const result = await architect.process({ someField: 'value' } as any);
    expect(result.validatedContent).toContain('someField');
    expect(result.validatedContent).toContain('value');
  });

  it('throws when content has too many binary characters (>10%)', async () => {
    // Create content with >10% non-printable chars (excluding tab/newline/CR)
    const binaryChars = String.fromCharCode(0, 1, 2, 3, 4, 5);
    const normalChars = 'abcdefghij'; // 10 normal chars
    // 6 binary out of 16 total = 37.5% binary
    const badContent = normalChars + binaryChars;
    await expect(architect.process({ content: badContent })).rejects.toThrow(
      'non-printable characters',
    );
  });

  it('passes content with low binary character ratio (<10%)', async () => {
    // 1 binary char out of 100+ total = well under 10%
    const content = 'A'.repeat(100) + String.fromCharCode(1);
    const result = await architect.process({ content });
    expect(result.validatedContent).toBeDefined();
  });

  it('allows tabs, newlines, and carriage returns in content', async () => {
    const content = 'Hello\tWorld\nNew line\rCarriage return';
    const result = await architect.process({ content });
    expect(result.validatedContent).toBe(content);
  });

  it('preserves original response fields alongside validatedContent', async () => {
    const response = { content: 'test', model: 'sonnet' as const, tokensUsed: 42 };
    const result = await architect.process(response);
    expect(result.model).toBe('sonnet');
    expect(result.tokensUsed).toBe(42);
    expect(result.validatedContent).toBe('test');
  });

  it('handles content that is exactly at the binary threshold (10%)', async () => {
    // 10 binary out of 100 = exactly 10% — should pass since check is > 0.1 (not >=)
    const content = 'A'.repeat(90) + String.fromCharCode(1).repeat(10);
    const result = await architect.process({ content });
    expect(result.validatedContent).toBeDefined();
  });

  it('rejects content with binary ratio just above 10%', async () => {
    // 11 binary out of 100 = 11%
    const content = 'A'.repeat(89) + String.fromCharCode(1).repeat(11);
    await expect(architect.process({ content })).rejects.toThrow('non-printable characters');
  });

  it('handles empty data object by falling back to JSON.stringify', async () => {
    const result = await architect.process({ data: {} } as any);
    // JSON.stringify({data:{}}) is not empty, so it should produce validated content
    expect(result.validatedContent).toBeDefined();
  });
});
