import { describe, expect, it } from 'vitest';
import { getErrorMessage, safeJsonParse } from '../../src/utils/errors.js';

describe('errors — getErrorMessage', () => {
  it('extracts message from an Error instance', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('extracts message from a subclass of Error', () => {
    expect(getErrorMessage(new TypeError('bad type'))).toBe('bad type');
    expect(getErrorMessage(new RangeError('out of range'))).toBe('out of range');
  });

  it('stringifies a plain string', () => {
    expect(getErrorMessage('something went wrong')).toBe('something went wrong');
  });

  it('stringifies a number', () => {
    expect(getErrorMessage(42)).toBe('42');
  });

  it('stringifies null', () => {
    expect(getErrorMessage(null)).toBe('null');
  });

  it('stringifies undefined', () => {
    expect(getErrorMessage(undefined)).toBe('undefined');
  });

  it('stringifies a boolean', () => {
    expect(getErrorMessage(false)).toBe('false');
  });

  it('stringifies an object', () => {
    expect(getErrorMessage({ key: 'val' })).toBe('[object Object]');
  });

  it('handles Error with empty message', () => {
    expect(getErrorMessage(new Error(''))).toBe('');
  });
});

describe('errors — safeJsonParse', () => {
  it('parses valid JSON', () => {
    expect(safeJsonParse('{"a":1}', {})).toEqual({ a: 1 });
  });

  it('parses valid JSON array', () => {
    expect(safeJsonParse('[1,2,3]', [])).toEqual([1, 2, 3]);
  });

  it('parses JSON string value', () => {
    expect(safeJsonParse('"hello"', '')).toBe('hello');
  });

  it('parses JSON number', () => {
    expect(safeJsonParse('42', 0)).toBe(42);
  });

  it('parses JSON boolean', () => {
    expect(safeJsonParse('true', false)).toBe(true);
  });

  it('parses JSON null', () => {
    expect(safeJsonParse('null', 'fallback')).toBeNull();
  });

  it('returns fallback for invalid JSON', () => {
    expect(safeJsonParse('not json', 'default')).toBe('default');
  });

  it('returns fallback for empty string', () => {
    expect(safeJsonParse('', [])).toEqual([]);
  });

  it('returns fallback for truncated JSON', () => {
    expect(safeJsonParse('{"a":', null)).toBeNull();
  });

  it('returns fallback for trailing comma JSON', () => {
    expect(safeJsonParse('{"a":1,}', { fallback: true })).toEqual({ fallback: true });
  });

  it('preserves type of fallback when returned', () => {
    const fallback = { x: 10, y: 20 };
    const result = safeJsonParse('bad', fallback);
    expect(result).toBe(fallback); // Same reference
  });
});
