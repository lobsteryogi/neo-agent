import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentRegistry } from '../../src/agents/registry';

describe('AgentRegistry', () => {
  const fixtureDir = join(__dirname, '__tmp_agent_registry__');
  let registry: AgentRegistry;

  beforeEach(() => {
    // Create agent directories with AGENT.md files
    mkdirSync(join(fixtureDir, 'test-coder'), { recursive: true });
    writeFileSync(
      join(fixtureDir, 'test-coder', 'AGENT.md'),
      '---\nname: test-coder\ndescription: A test coder\nmodel: opus\nmaxTurns: 10\nallowedTools: [filesystem, git]\n---\n\n# Test Coder\n\nYou write code.',
    );

    mkdirSync(join(fixtureDir, 'test-planner'), { recursive: true });
    writeFileSync(
      join(fixtureDir, 'test-planner', 'AGENT.md'),
      '---\nname: test-planner\ndescription: A test planner\nmodel: sonnet\n---\n\n# Test Planner\n\nYou plan tasks.',
    );

    // Directory without AGENT.md
    mkdirSync(join(fixtureDir, 'no-agent'), { recursive: true });

    registry = new AgentRegistry();
    registry.loadFromDirectory(fixtureDir);
  });

  afterEach(() => {
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  it('registers and retrieves a blueprint', () => {
    const bp = registry.get('test-coder');
    expect(bp).toBeDefined();
    expect(bp?.name).toBe('test-coder');
    expect(bp?.model).toBe('opus');
  });

  it('returns undefined for non-existent blueprint', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('lists all registered blueprints', () => {
    expect(registry.getAll()).toHaveLength(2);
  });

  it('overwrites blueprint with same name', () => {
    registry.register({
      name: 'test-coder',
      description: 'Updated coder',
      systemPrompt: 'You are updated.',
      model: 'sonnet',
    });
    expect(registry.get('test-coder')?.model).toBe('sonnet');
  });

  it('loads blueprints from AGENT.md files in directory', () => {
    const bp = registry.get('test-planner');
    expect(bp?.systemPrompt).toContain('Test Planner');
    expect(bp?.description).toBe('A test planner');
  });

  it('ignores directories without AGENT.md', () => {
    expect(registry.get('no-agent')).toBeUndefined();
    expect(registry.size).toBe(2);
  });

  it('parses allowedTools from frontmatter', () => {
    const bp = registry.get('test-coder');
    expect(bp?.allowedTools).toEqual(['filesystem', 'git']);
  });
});
