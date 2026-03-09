import { describe, expect, it } from 'vitest';
import { AgentMessageBus } from '../../src/agents/message-bus';

describe('AgentMessageBus', () => {
  it('posts and retrieves messages for a specific agent', () => {
    const bus = new AgentMessageBus();
    bus.post({
      teamId: 'team-1',
      fromAgent: 'researcher',
      toAgent: 'coder',
      type: 'finding',
      content: 'Found relevant API docs',
    });

    const msgs = bus.getForAgent('team-1', 'coder');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe('Found relevant API docs');
  });

  it('broadcast messages are visible to all agents', () => {
    const bus = new AgentMessageBus();
    bus.post({
      teamId: 'team-1',
      fromAgent: 'planner',
      toAgent: '*',
      type: 'update',
      content: 'Starting phase 2',
    });

    expect(bus.getForAgent('team-1', 'coder')).toHaveLength(1);
    expect(bus.getForAgent('team-1', 'researcher')).toHaveLength(1);
  });

  it('isolates messages by teamId', () => {
    const bus = new AgentMessageBus();
    bus.post({
      teamId: 'team-1',
      fromAgent: 'a',
      toAgent: '*',
      type: 'update',
      content: 'Team 1 msg',
    });
    bus.post({
      teamId: 'team-2',
      fromAgent: 'b',
      toAgent: '*',
      type: 'update',
      content: 'Team 2 msg',
    });

    expect(bus.getAll('team-1')).toHaveLength(1);
    expect(bus.getAll('team-2')).toHaveLength(1);
  });

  it('clear removes all messages for a team', () => {
    const bus = new AgentMessageBus();
    bus.post({ teamId: 'team-1', fromAgent: 'a', toAgent: '*', type: 'update', content: 'msg' });
    bus.clear('team-1');
    expect(bus.getAll('team-1')).toHaveLength(0);
  });

  it('messages have auto-generated id and timestamp', () => {
    const bus = new AgentMessageBus();
    const msg = bus.post({
      teamId: 'team-1',
      fromAgent: 'a',
      toAgent: 'b',
      type: 'finding',
      content: 'test',
    });

    expect(msg.id).toBeDefined();
    expect(msg.id.length).toBeGreaterThan(0);
    expect(msg.timestamp).toBeGreaterThan(0);
  });
});
