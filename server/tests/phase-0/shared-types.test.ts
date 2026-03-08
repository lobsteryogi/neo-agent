import type {
  AgentResponse,
  FadeCheck,
  GateVerdict,
  HandoffSnapshot,
  HealthStatus,
  InboundMessage,
  MemoryEntry,
  MemorySearchResult,
  Message,
  NeoConfig,
  RouteDecision,
  Session,
} from '@neo-agent/shared';
import { describe, expect, it } from 'vitest';

describe('Phase 0 — Shared Types', () => {
  it('Session interface enforces required fields', () => {
    const session: Session = {
      id: 's1',
      channel: 'web',
      model: 'sonnet',
      status: 'active',
      startedAt: Date.now(),
      totalTokens: 0,
    };
    expect(session.id).toBe('s1');
    expect(session.channel).toBe('web');
    expect(session.endedAt).toBeUndefined(); // Optional
  });

  it('Message interface enforces required fields', () => {
    const message: Message = {
      id: 'm1',
      sessionId: 's1',
      role: 'user',
      content: 'Hello',
      tokens: 5,
      timestamp: Date.now(),
    };
    expect(message.role).toBe('user');
    expect(typeof message.tokens).toBe('number');
  });

  it('GateVerdict has correct structure', () => {
    const verdict: GateVerdict = {
      blocked: true,
      gate: 'freeWill',
      reason: 'Approval required',
      neoQuip: 'Say the magic words...',
    };
    expect(verdict.blocked).toBe(true);
    expect(verdict.gate).toBe('freeWill');
  });

  it('HealthStatus uses correct status enum', () => {
    const health: HealthStatus = {
      status: 'operational',
      uptime: 12345,
      claude: { responsive: true, lastLatencyMs: 230 },
      memory: { dbSizeMb: 5.2, ftsEntries: 1420 },
      gates: { blockedLast1h: 3 },
      sync: { behind: false },
      tools: {},
    };
    expect(health.status).toBe('operational');
    expect(health.claude.responsive).toBe(true);
  });

  it('InboundMessage includes sessionKey', () => {
    const msg: InboundMessage = {
      id: 'ib1',
      channelId: 'ch1',
      channel: 'telegram',
      userId: 'u1',
      content: 'Hello there',
      timestamp: Date.now(),
      sessionKey: 'telegram:u1',
    };
    expect(msg.sessionKey).toBe('telegram:u1');
  });

  it('HandoffSnapshot has all required fields', () => {
    const snapshot: HandoffSnapshot = {
      id: 'h1',
      decisions: ['Use TypeScript'],
      keyFacts: ['Project uses Express'],
      openQuestions: ['What DB?'],
      workInProgress: ['Setup wizard'],
      userPreferences: ['Dark mode'],
      timestamp: Date.now(),
    };
    expect(snapshot.decisions).toHaveLength(1);
    expect(snapshot.keyFacts).toHaveLength(1);
  });

  it('FadeCheck reflects fading state', () => {
    const fade: FadeCheck = { fading: true, ratio: 0.87, snapshotId: 'h1' };
    expect(fade.fading).toBe(true);
    expect(fade.ratio).toBeGreaterThan(0.85);
  });

  it('RouteDecision includes a valid model', () => {
    const decision: RouteDecision = {
      selectedModel: 'opus',
      score: 0.92,
      classification: {
        complexity: 0.9,
        tokenEstimate: 5000,
        contextNeeds: 0.8,
        precisionRequired: 0.9,
        toolUsage: true,
        speedPriority: 0.1,
      },
    };
    expect(['haiku', 'sonnet', 'opus']).toContain(decision.selectedModel);
  });

  it('MemorySearchResult extends MemoryEntry', () => {
    const result: MemorySearchResult = {
      id: 'mem1',
      type: 'fact',
      content: 'User prefers dark mode',
      importance: 0.8,
      tags: ['preference'],
      sourceSession: 's1',
      relevance: 0.95,
      source: 'long-term',
    };
    expect(result.relevance).toBe(0.95);
    expect(result.source).toBe('long-term');
  });
});
