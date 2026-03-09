/**
 * ░▒▓ AGENT MESSAGE BUS ▓▒░
 *
 * "What good is a phone call if you're unable to speak?"
 *
 * In-memory message bus for inter-agent communication within a team.
 * Agents can post findings, questions, updates, and artifacts to a
 * shared bus that sibling agents can read.
 */

import type { AgentMessage } from '@neo-agent/shared';
import { randomUUID } from 'crypto';

export class AgentMessageBus {
  private messages = new Map<string, AgentMessage[]>(); // teamId → messages

  post(msg: Omit<AgentMessage, 'id' | 'timestamp'>): AgentMessage {
    const full: AgentMessage = {
      ...msg,
      id: randomUUID(),
      timestamp: Date.now(),
    };

    const existing = this.messages.get(msg.teamId) ?? [];
    existing.push(full);
    this.messages.set(msg.teamId, existing);
    return full;
  }

  /**
   * Get messages addressed to a specific agent (including broadcasts).
   */
  getForAgent(teamId: string, agentName: string): AgentMessage[] {
    const all = this.messages.get(teamId) ?? [];
    return all.filter((m) => m.toAgent === agentName || m.toAgent === '*');
  }

  getAll(teamId: string): AgentMessage[] {
    return this.messages.get(teamId) ?? [];
  }

  clear(teamId: string) {
    this.messages.delete(teamId);
  }

  get teamCount(): number {
    return this.messages.size;
  }
}
