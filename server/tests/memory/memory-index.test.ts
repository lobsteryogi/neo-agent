import { describe, expect, it } from 'vitest';
import * as MemoryModule from '../../src/memory/index';

describe('Memory Module — barrel exports', () => {
  // ── Class Exports ───────────────────────────────────────────

  it('exports DailyLog class', () => {
    expect(MemoryModule.DailyLog).toBeDefined();
    expect(typeof MemoryModule.DailyLog).toBe('function');
  });

  it('exports MemoryExtractor class', () => {
    expect(MemoryModule.MemoryExtractor).toBeDefined();
    expect(typeof MemoryModule.MemoryExtractor).toBe('function');
  });

  it('exports LongTermMemory class', () => {
    expect(MemoryModule.LongTermMemory).toBeDefined();
    expect(typeof MemoryModule.LongTermMemory).toBe('function');
  });

  it('exports OperationalMemory class', () => {
    expect(MemoryModule.OperationalMemory).toBeDefined();
    expect(typeof MemoryModule.OperationalMemory).toBe('function');
  });

  it('exports MemorySearch class', () => {
    expect(MemoryModule.MemorySearch).toBeDefined();
    expect(typeof MemoryModule.MemorySearch).toBe('function');
  });

  it('exports SessionHandoff class', () => {
    expect(MemoryModule.SessionHandoff).toBeDefined();
    expect(typeof MemoryModule.SessionHandoff).toBe('function');
  });

  it('exports SessionTranscript class', () => {
    expect(MemoryModule.SessionTranscript).toBeDefined();
    expect(typeof MemoryModule.SessionTranscript).toBe('function');
  });

  // ── Completeness ────────────────────────────────────────────

  it('exports exactly the expected set of named exports', () => {
    const exportedNames = Object.keys(MemoryModule).sort();

    // Classes (runtime exports — types are erased at runtime)
    const expectedClasses = [
      'DailyLog',
      'LongTermMemory',
      'MemoryExtractor',
      'MemorySearch',
      'OperationalMemory',
      'SessionHandoff',
      'SessionTranscript',
    ].sort();

    expect(exportedNames).toEqual(expectedClasses);
  });

  // ── All exports are constructors ────────────────────────────

  it('all runtime exports are constructor functions', () => {
    const exports = [
      MemoryModule.DailyLog,
      MemoryModule.LongTermMemory,
      MemoryModule.MemoryExtractor,
      MemoryModule.MemorySearch,
      MemoryModule.OperationalMemory,
      MemoryModule.SessionHandoff,
      MemoryModule.SessionTranscript,
    ];

    for (const Export of exports) {
      expect(typeof Export).toBe('function');
      // Constructor functions have a prototype
      expect(Export.prototype).toBeDefined();
    }
  });

  // ── No default export ───────────────────────────────────────

  it('does not have a default export', () => {
    expect((MemoryModule as any).default).toBeUndefined();
  });
});
