import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RouterEngine, ROUTING_PROFILES } from '../../src/router/engine';

describe('RouterEngine', () => {
  let db: Database.Database;
  let engine: RouterEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        session_id TEXT,
        gate_name TEXT,
        model_used TEXT,
        tokens_used INTEGER,
        blocked INTEGER DEFAULT 0,
        details TEXT,
        response_summary TEXT
      )
    `);
    engine = new RouterEngine(db);
  });

  afterEach(() => {
    db.close();
  });

  // ── Model Selection ────────────────────────────────────────

  it('routes high-complexity tasks to opus', () => {
    const result = engine.selectModel(
      {
        complexity: 0.9,
        tokenEstimate: 5000,
        contextNeeds: 0.8,
        precisionRequired: 0.9,
        toolUsage: true,
        speedPriority: 0.1,
      },
      'auto',
    );
    expect(result.selectedModel).toBe('opus');
  });

  it('routes simple questions to sonnet (minimum tier)', () => {
    const result = engine.selectModel(
      {
        complexity: 0.1,
        tokenEstimate: 100,
        contextNeeds: 0.1,
        precisionRequired: 0.2,
        toolUsage: false,
        speedPriority: 0.9,
      },
      'auto',
    );
    expect(result.selectedModel).toBe('sonnet');
  });

  it('routes medium-high tasks to opus', () => {
    const result = engine.selectModel(
      {
        complexity: 0.6,
        tokenEstimate: 3000,
        contextNeeds: 0.5,
        precisionRequired: 0.6,
        toolUsage: true,
        speedPriority: 0.3,
      },
      'auto',
    );
    expect(result.selectedModel).toBe('opus');
  });

  // ── Profile Biasing ────────────────────────────────────────

  it('eco profile biases toward haiku', () => {
    const result = engine.selectModel(
      {
        complexity: 0.5,
        tokenEstimate: 2000,
        contextNeeds: 0.5,
        precisionRequired: 0.5,
        toolUsage: false,
        speedPriority: 0.5,
      },
      'eco',
    );
    expect(['haiku', 'sonnet']).toContain(result.selectedModel);
  });

  it('premium profile biases toward opus', () => {
    const result = engine.selectModel(
      {
        complexity: 0.6,
        tokenEstimate: 3000,
        contextNeeds: 0.7,
        precisionRequired: 0.8,
        toolUsage: true,
        speedPriority: 0.1,
      },
      'premium',
    );
    expect(result.selectedModel).toBe('opus');
  });

  // ── Max Turns ──────────────────────────────────────────────

  it('sets maxTurns=20 for high-complexity', () => {
    const result = engine.selectModel(
      {
        complexity: 0.8,
        tokenEstimate: 2000,
        contextNeeds: 0.4,
        precisionRequired: 0.5,
        toolUsage: false,
        speedPriority: 0.3,
      },
      'auto',
    );
    expect(result.maxTurns).toBe(20);
  });

  it('sets maxTurns=5 for low-complexity', () => {
    const result = engine.selectModel(
      {
        complexity: 0.2,
        tokenEstimate: 100,
        contextNeeds: 0.1,
        precisionRequired: 0.2,
        toolUsage: false,
        speedPriority: 0.8,
      },
      'auto',
    );
    expect(result.maxTurns).toBe(5);
  });

  // ── Audit Logging (Audit Fix S2) ───────────────────────────

  it('logs routing decision to audit_log', () => {
    engine.selectModel(
      {
        complexity: 0.5,
        tokenEstimate: 1000,
        contextNeeds: 0.3,
        precisionRequired: 0.5,
        toolUsage: false,
        speedPriority: 0.5,
      },
      'auto',
    );

    const log = db
      .prepare("SELECT * FROM audit_log WHERE event_type = 'route_decision'")
      .get() as any;
    expect(log).toBeTruthy();
    expect(log.model_used).toBeTruthy();

    const parsed = JSON.parse(log.response_summary);
    expect(parsed).toHaveProperty('score');
    expect(parsed).toHaveProperty('classification');
    expect(parsed).toHaveProperty('profile', 'auto');
  });

  // ── Exports ────────────────────────────────────────────────

  it('exports ROUTING_PROFILES', () => {
    expect(ROUTING_PROFILES).toHaveProperty('auto');
    expect(ROUTING_PROFILES).toHaveProperty('eco');
    expect(ROUTING_PROFILES).toHaveProperty('balanced');
    expect(ROUTING_PROFILES).toHaveProperty('premium');
  });
});
