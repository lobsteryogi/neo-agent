import { describe, expect, it } from 'vitest';
import { TaskClassifier, type ClassifierContext } from '../../src/router/classifier';

const mockContext: ClassifierContext = {
  tokenCount: 0,
  hasActiveTools: false,
};

const highContext: ClassifierContext = {
  tokenCount: 160_000, // 80% of 200k
  hasActiveTools: true,
};

describe('TaskClassifier', () => {
  const classifier = new TaskClassifier();

  // ── Complexity ──────────────────────────────────────────────

  it('scores architecture-level tasks as high complexity', () => {
    const result = classifier.classify(
      'Architect a new microservices system with distributed caching',
      mockContext,
    );
    expect(result.complexity).toBeGreaterThanOrEqual(0.7);
  });

  it('scores simple questions as low complexity', () => {
    const result = classifier.classify('What is a Promise in JavaScript?', mockContext);
    expect(result.complexity).toBeLessThanOrEqual(0.3);
  });

  it('scores implementation tasks as medium complexity', () => {
    const result = classifier.classify('Implement a login form with validation', mockContext);
    expect(result.complexity).toBeGreaterThan(0.3);
    expect(result.complexity).toBeLessThan(0.85);
  });

  it('applies length bonus for verbose prompts', () => {
    const short = classifier.classify('hello', mockContext);
    const long = classifier.classify('a'.repeat(2000), mockContext);
    expect(long.complexity).toBeGreaterThan(short.complexity);
  });

  // ── Tool Usage ──────────────────────────────────────────────

  it('detects tool usage requirement', () => {
    const withTools = classifier.classify('Read the file src/index.ts and fix it', mockContext);
    expect(withTools.toolUsage).toBe(true);

    const noTools = classifier.classify('Explain how async/await works', mockContext);
    expect(noTools.toolUsage).toBe(false);
  });

  it('detects git operations as tool usage', () => {
    const result = classifier.classify('commit and push changes', mockContext);
    expect(result.toolUsage).toBe(true);
  });

  // ── Token Estimate ─────────────────────────────────────────

  it('estimates fewer tokens for short queries', () => {
    const short = classifier.classify('hi', mockContext);
    const long = classifier.classify('a'.repeat(600), mockContext);
    expect(short.tokenEstimate).toBeLessThan(long.tokenEstimate);
  });

  // ── Context Needs ──────────────────────────────────────────

  it('returns low context needs for new sessions', () => {
    const result = classifier.classify('hello', mockContext);
    expect(result.contextNeeds).toBe(0);
  });

  it('returns high context needs for active sessions', () => {
    const result = classifier.classify('hello', highContext);
    expect(result.contextNeeds).toBe(0.8);
  });

  // ── Speed Priority ─────────────────────────────────────────

  it('scores speed keywords as high speed priority', () => {
    const result = classifier.classify('Give me a quick one-liner', mockContext);
    expect(result.speedPriority).toBeGreaterThanOrEqual(0.5);
  });

  it('scores long complex tasks as low speed priority', () => {
    const result = classifier.classify(
      'Design a comprehensive authentication system with OAuth2, SAML, and LDAP support',
      mockContext,
    );
    expect(result.speedPriority).toBeLessThanOrEqual(0.4);
  });

  // ── Precision ──────────────────────────────────────────────

  it('scores security-related content as high precision', () => {
    const result = classifier.classify(
      'Review the authentication encryption in production',
      mockContext,
    );
    expect(result.precisionRequired).toBeGreaterThan(0.5);
  });
});
