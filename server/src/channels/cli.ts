/**
 * ░▒▓ CLI CHANNEL ▓▒░
 *
 * "Wake up."
 *
 * Interactive terminal channel with file path extraction for local media.
 */

import type { AgentResponse, Attachment, AttachmentType, InboundMessage } from '@neo-agent/shared';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import type { ChannelAdapter } from './interface.js';

const MIME_MAP: Record<string, string> = {
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
};

export class CliChannel implements ChannelAdapter {
  name = 'cli';
  private handler!: (message: InboundMessage) => Promise<AgentResponse | void>;
  private rl!: readline.Interface;

  async start(): Promise<void> {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    this.rl.setPrompt('\x1b[32mNeo>\x1b[0m ');
    this.rl.prompt();

    this.rl.on('line', async (line) => {
      const content = line.trim();
      if (!content) {
        this.rl.prompt();
        return;
      }

      const attachments = this.extractFileAttachments(content);
      await this.handler(this.toInbound(content, attachments));
      this.rl.prompt();
    });
  }

  async stop(): Promise<void> {
    this.rl?.close();
  }

  async send(_sessionId: string, response: AgentResponse): Promise<void> {
    process.stdout.write(response.content + '\n');
  }

  onMessage(handler: (message: InboundMessage) => Promise<AgentResponse | void>): void {
    this.handler = handler;
  }

  toInbound(content: string, attachments?: Attachment[]): InboundMessage {
    return {
      id: crypto.randomUUID(),
      channelId: 'cli',
      channel: 'cli',
      userId: 'local',
      content,
      timestamp: Date.now(),
      sessionKey: 'cli:local',
      attachments: attachments?.length ? attachments : undefined,
    };
  }

  /** Extract file paths from commands like "analyze /path/to/file.pdf". */
  extractFileAttachments(line: string): Attachment[] {
    const fileMatch = line.match(/(?:analyze|transcribe|read|describe)\s+(.+)/i);
    if (!fileMatch) return [];

    const filePath = fileMatch[1].trim();
    if (!fs.existsSync(filePath)) return [];

    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    return [
      {
        id: crypto.randomUUID(),
        type: inferType(ext),
        mimeType: MIME_MAP[ext] || 'application/octet-stream',
        fileName: path.basename(filePath),
        fileSize: stat.size,
        localPath: filePath,
      },
    ];
  }
}

export function inferType(ext: string): AttachmentType {
  if (['.ogg', '.mp3', '.wav', '.m4a', '.flac'].includes(ext)) return 'audio';
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'].includes(ext)) return 'image';
  if (['.mp4', '.mov', '.avi', '.mkv'].includes(ext)) return 'video';
  return 'document';
}
