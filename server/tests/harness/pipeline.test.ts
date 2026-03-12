import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryDb } from '../../src/db/connection';
import { HarnessPipeline } from '../../src/harness/index';

describe('HarnessPipeline (Orchestration)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createMemoryDb();
  });

  it('constructs with all five wrappers in the correct order', () => {
    const pipeline = new HarnessPipeline({ db });
    const wrappers = (pipeline as any).wrappers;

    expect(wrappers).toHaveLength(5);
    expect(wrappers[0].name).toBe('Architect');
    expect(wrappers[1].name).toBe('Simulation');
    expect(wrappers[2].name).toBe('Deadline');
    expect(wrappers[3].name).toBe('PersistenceProtocol');
    expect(wrappers[4].name).toBe('Historian');
  });

  it('exposes the historian instance', () => {
    const pipeline = new HarnessPipeline({ db });
    expect(pipeline.historian).toBeDefined();
    expect(pipeline.historian.name).toBe('Historian');
  });

  it('processes a valid response through the full pipeline', async () => {
    const pipeline = new HarnessPipeline({ db });
    const response = { content: 'Hello from Claude', model: 'sonnet' as const, tokensUsed: 42 };

    const result = await pipeline.process(response);

    // Architect adds validatedContent
    expect(result.validatedContent).toBe('Hello from Claude');
    // Deadline adds _deadline metadata
    expect(result._deadline).toBeDefined();
    expect(result._deadline.maxMs).toBe(600_000);
    // PersistenceProtocol adds _persistence metadata
    expect(result._persistence).toBeDefined();
    expect(result._persistence.maxRetries).toBe(3);
    // Historian logs to the database
    const rows = db.prepare('SELECT * FROM audit_log').all() as any[];
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects invalid (empty) responses via Architect', async () => {
    const pipeline = new HarnessPipeline({ db });
    await expect(pipeline.process(null as any)).rejects.toThrow('Architect');
  });

  it('handles empty-string content via Architect fallback to JSON.stringify', async () => {
    // Empty string is falsy, so Architect's extractContent falls through to JSON.stringify
    const pipeline = new HarnessPipeline({ db });
    const result = await pipeline.process({ content: '' });
    expect(result.validatedContent).toContain('content');
  });

  it('rejects whitespace-only content via Architect', async () => {
    const pipeline = new HarnessPipeline({ db });
    await expect(pipeline.process({ content: '   \n  ' })).rejects.toThrow('no text content');
  });

  it('uses custom timeout via Deadline', async () => {
    const pipeline = new HarnessPipeline({ db, timeoutMs: 30_000 });
    const result = await pipeline.process({ content: 'test' });

    expect(result._deadline.maxMs).toBe(30_000);
  });

  it('uses custom maxRetries via PersistenceProtocol', async () => {
    const pipeline = new HarnessPipeline({ db, maxRetries: 5 });
    const result = await pipeline.process({ content: 'test' });

    expect(result._persistence.maxRetries).toBe(5);
  });

  it('enables dry-run mode via Simulation', async () => {
    const pipeline = new HarnessPipeline({ db, dryRun: true });
    const result = await pipeline.process({ content: 'Deploy now' });

    expect(result.dryRun).toBe(true);
    expect(result.content).toContain('[SIMULATION MODE]');
  });

  it('passes session data through the pipeline to Historian', async () => {
    const pipeline = new HarnessPipeline({ db });
    const session = {
      id: 'test-session',
      channel: 'cli' as const,
      model: 'sonnet' as const,
      status: 'active' as const,
      startedAt: Date.now(),
      totalTokens: 0,
    };

    await pipeline.process({ content: 'Hello' }, session);

    const row = db.prepare('SELECT session_id FROM audit_log').get() as any;
    expect(row.session_id).toBe('test-session');
  });

  it('processes response with data.content correctly', async () => {
    const pipeline = new HarnessPipeline({ db });
    const response = { data: { content: 'From data field' } };

    const result = await pipeline.process(response);
    expect(result.validatedContent).toBe('From data field');
  });
});
