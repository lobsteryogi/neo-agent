/**
 * ░▒▓ CHANNEL INTERFACE ▓▒░
 *
 * "The phone lines are open."
 *
 * All channels implement this adapter — CLI, Web, Telegram.
 * The agent loop never needs to know which channel originated a message.
 */

import type { AgentResponse, InboundMessage } from '@neo-agent/shared';

export interface ChannelAdapter {
  name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  send(sessionId: string, response: AgentResponse): Promise<void>;
  onMessage(handler: (message: InboundMessage) => Promise<AgentResponse | void>): void;
}
