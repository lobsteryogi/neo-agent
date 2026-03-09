/**
 * ░▒▓ WEB CHANNEL ▓▒░
 *
 * "I know you're out there. I can feel you now."
 *
 * WebSocket channel with token auth, base64 file upload support,
 * and structured JSON protocol for the dashboard.
 */

import type { AgentResponse, Attachment, InboundMessage } from '@neo-agent/shared';
import * as crypto from 'crypto';
import { mkdtemp, writeFile } from 'fs/promises';
import type { IncomingMessage } from 'http';
import { tmpdir } from 'os';
import { join } from 'path';
import { WebSocket, WebSocketServer } from 'ws';
import { inferType } from './cli.js';
import type { ChannelAdapter } from './interface.js';

export interface WebChannelConfig {
  port: number;
  token: string;
}

export class WebChannel implements ChannelAdapter {
  name = 'web';
  private wss: WebSocketServer;
  private wsToken: string;
  private clients = new Map<string, WebSocket>();
  private handler!: (message: InboundMessage) => Promise<AgentResponse | void>;

  constructor(config: WebChannelConfig) {
    this.wsToken = config.token;
    this.wss = new WebSocketServer({ port: config.port });
  }

  async start(): Promise<void> {
    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      if (token !== this.wsToken) {
        ws.close(4001, 'Unauthorized');
        return;
      }

      const userId = url.searchParams.get('userId') || crypto.randomUUID();
      this.clients.set(userId, ws);

      ws.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'message') {
            const attachments = msg.attachments
              ? await this.processUploads(msg.attachments)
              : undefined;
            await this.handler(this.toInbound(msg.text || '', userId, attachments));
          }
        } catch {
          // Ignore malformed messages
        }
      });

      ws.on('close', () => this.clients.delete(userId));
    });
  }

  async stop(): Promise<void> {
    for (const ws of this.clients.values()) {
      ws.close();
    }
    this.clients.clear();
    this.wss.close();
  }

  async send(sessionId: string, response: AgentResponse): Promise<void> {
    const payload = JSON.stringify({ type: 'response', sessionId, ...response });
    for (const ws of this.clients.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  onMessage(handler: (message: InboundMessage) => Promise<AgentResponse | void>): void {
    this.handler = handler;
  }

  toInbound(text: string, userId: string, attachments?: Attachment[]): InboundMessage {
    return {
      id: crypto.randomUUID(),
      channelId: 'web',
      channel: 'web',
      userId,
      content: text,
      timestamp: Date.now(),
      sessionKey: `web:${userId}`,
      attachments: attachments?.length ? attachments : undefined,
    };
  }

  async processUploads(
    raw: Array<{ data: string; fileName: string; mimeType: string }>,
  ): Promise<Attachment[]> {
    return Promise.all(
      raw.map(async (file) => {
        const buffer = Buffer.from(file.data, 'base64');
        const dir = await mkdtemp(join(tmpdir(), 'neo-web-'));
        const localPath = join(dir, file.fileName);
        await writeFile(localPath, buffer);

        const ext = file.fileName.split('.').pop() ?? '';

        return {
          id: crypto.randomUUID(),
          type: inferType(`.${ext}`),
          mimeType: file.mimeType,
          fileName: file.fileName,
          fileSize: buffer.length,
          localPath,
        };
      }),
    );
  }
}
