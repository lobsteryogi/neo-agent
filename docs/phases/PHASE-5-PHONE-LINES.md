# Phase 5 — Phone Lines (Channels + Media Intelligence)

> _"There is no spoon... but there are notifications."_

**Goal**: Build the multi-channel adapter architecture (CLI, Web, Telegram), media processing pipeline (voice transcription, image analysis, document extraction), and wire everything through the unified agent loop.

**Estimated time**: 6–8 hours
**Prerequisites**: Phase 1 (agent loop), Phase 2 (memory), Phase 3 (router + tools)

---

## 5.1 — Channel Interface

### `server/src/channels/interface.ts`

All channels implement the same adapter interface. This decouples transport from logic — the agent loop never needs to know which channel originated a message.

```typescript
import type { AgentResponse, InboundMessage } from '@neo-agent/shared';

export interface ChannelAdapter {
  name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  send(sessionId: string, response: AgentResponse): Promise<void>;
  onMessage(handler: (message: InboundMessage) => Promise<void>): void;
}
```

### Shared Types — `packages/shared/src/index.ts`

Extend `InboundMessage` and add Attachment types:

```typescript
export type AttachmentType = 'voice' | 'image' | 'document' | 'video' | 'audio';

export interface Attachment {
  id: string;
  type: AttachmentType;
  mimeType: string;
  fileName?: string;
  fileSize: number;
  url?: string; // Remote URL (Telegram CDN etc.)
  localPath?: string; // After download to temp storage
  duration?: number; // For voice/audio/video (seconds)
  width?: number; // For images/video
  height?: number; // For images/video
  transcription?: string; // Populated after voice transcription
  analysis?: string; // Populated after image/document analysis
}

// Add to InboundMessage:
export interface InboundMessage {
  // ... existing fields ...
  attachments?: Attachment[];
}
```

---

## 5.2 — CLI Channel

### `server/src/channels/cli.ts`

Wraps the existing `chat.ts` REPL as a `ChannelAdapter`. Supports file path extraction for local media analysis.

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import type { ChannelAdapter } from './interface.js';
import type { AgentResponse, Attachment, InboundMessage } from '@neo-agent/shared';

export class CliChannel implements ChannelAdapter {
  name = 'cli';
  private handler!: (message: InboundMessage) => Promise<void>;
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

  onMessage(handler: (message: InboundMessage) => Promise<void>): void {
    this.handler = handler;
  }

  private toInbound(content: string, attachments?: Attachment[]): InboundMessage {
    return {
      id: crypto.randomUUID(),
      channelId: 'cli',
      channel: 'cli',
      userId: 'local',
      content,
      timestamp: Date.now(),
      sessionKey: 'cli:local',
      attachments,
    };
  }

  /** Extract file paths from commands like "analyze /path/to/file.pdf". */
  private extractFileAttachments(line: string): Attachment[] {
    const fileMatch = line.match(/(?:analyze|transcribe|read|describe)\s+(.+)/i);
    if (!fileMatch) return [];

    const filePath = fileMatch[1].trim();
    if (!fs.existsSync(filePath)) return [];

    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    return [
      {
        id: crypto.randomUUID(),
        type: this.inferType(ext),
        mimeType: this.inferMime(ext),
        fileName: path.basename(filePath),
        fileSize: stat.size,
        localPath: filePath,
      },
    ];
  }

  private inferType(ext: string): Attachment['type'] {
    if (['.ogg', '.mp3', '.wav', '.m4a', '.flac'].includes(ext)) return 'audio';
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'].includes(ext)) return 'image';
    if (['.mp4', '.mov', '.avi', '.mkv'].includes(ext)) return 'video';
    return 'document';
  }

  private inferMime(ext: string): string {
    const map: Record<string, string> = {
      '.ogg': 'audio/ogg',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.pdf': 'application/pdf',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
    };
    return map[ext] || 'application/octet-stream';
  }
}
```

---

## 5.3 — Web Channel (Dashboard WebSocket)

### `server/src/channels/web.ts`

WebSocket channel with token auth, file upload support, and structured JSON protocol.

```typescript
import type { IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { ChannelAdapter } from './interface.js';
import type { AgentResponse, Attachment, InboundMessage } from '@neo-agent/shared';

export class WebChannel implements ChannelAdapter {
  name = 'web';
  private wss: WebSocketServer;
  private wsToken: string;
  private clients = new Map<string, WebSocket>();
  private handler!: (message: InboundMessage) => Promise<void>;

  constructor(port: number, token: string) {
    this.wsToken = token;
    this.wss = new WebSocketServer({ port });
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
        const msg = JSON.parse(data.toString());
        if (msg.type === 'message') {
          const attachments = msg.attachments
            ? await this.processUploads(msg.attachments)
            : undefined;
          await this.handler(this.toInbound(msg.text, userId, attachments));
        }
      });

      ws.on('close', () => this.clients.delete(userId));
    });
  }

  async stop(): Promise<void> {
    this.wss.close();
  }

  async send(sessionId: string, response: AgentResponse): Promise<void> {
    // Broadcast to all connected clients for now
    for (const ws of this.clients.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'response', sessionId, ...response }));
      }
    }
  }

  onMessage(handler: (message: InboundMessage) => Promise<void>): void {
    this.handler = handler;
  }

  private toInbound(text: string, userId: string, attachments?: Attachment[]): InboundMessage {
    return {
      id: crypto.randomUUID(),
      channelId: 'web',
      channel: 'web',
      userId,
      content: text,
      timestamp: Date.now(),
      sessionKey: `web:${userId}`,
      attachments,
    };
  }

  private async processUploads(
    raw: Array<{ data: string; fileName: string; mimeType: string }>,
  ): Promise<Attachment[]> {
    const { writeFile, mkdtemp } = await import('fs/promises');
    const { join } = await import('path');
    const { tmpdir } = await import('os');

    return Promise.all(
      raw.map(async (file) => {
        const buffer = Buffer.from(file.data, 'base64');
        const dir = await mkdtemp(join(tmpdir(), 'neo-'));
        const localPath = join(dir, file.fileName);
        await writeFile(localPath, buffer);

        return {
          id: crypto.randomUUID(),
          type: this.inferType(file.mimeType) as Attachment['type'],
          mimeType: file.mimeType,
          fileName: file.fileName,
          fileSize: buffer.length,
          localPath,
        };
      }),
    );
  }

  private inferType(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
    return 'document';
  }
}
```

---

## 5.4 — Telegram Channel

### `server/src/channels/telegram.ts`

Uses **Grammy** (`grammy`) — the same framework as OpenClaw. Handles media downloads, bot commands, and message dispatch with Telegram-native features (reactions, typing indicators).

```typescript
import { Bot } from 'grammy';
import type { ChannelAdapter } from './interface.js';
import type { AgentResponse, Attachment, InboundMessage } from '@neo-agent/shared';

export class TelegramChannel implements ChannelAdapter {
  name = 'telegram';
  private bot: Bot;
  private handler!: (message: InboundMessage) => Promise<void>;

  constructor(private token: string) {
    this.bot = new Bot(token);
  }

  async start(): Promise<void> {
    // Text messages
    this.bot.on('message:text', async (ctx) => {
      const text = ctx.message.text;

      // Handle bot commands
      if (text.startsWith('/')) {
        const handled = await this.handleCommand(text, ctx);
        if (handled) return;
      }

      await this.handler(this.toInbound(ctx));
    });

    // Voice messages
    this.bot.on('message:voice', async (ctx) => {
      const attachment = await this.downloadMedia(ctx, 'voice');
      const inbound = this.toInbound(ctx, [attachment]);
      await this.handler(inbound);
    });

    // Photos
    this.bot.on('message:photo', async (ctx) => {
      const photos = ctx.message.photo!;
      const largest = photos[photos.length - 1];
      const attachment = await this.downloadPhoto(ctx, largest);
      const inbound = this.toInbound(ctx, [attachment]);
      await this.handler(inbound);
    });

    // Documents
    this.bot.on('message:document', async (ctx) => {
      const attachment = await this.downloadDocument(ctx);
      const inbound = this.toInbound(ctx, [attachment]);
      await this.handler(inbound);
    });

    // Start polling
    this.bot.start({ onStart: () => console.log('Telegram bot started') });
  }

  async stop(): Promise<void> {
    this.bot.stop();
  }

  async send(_sessionId: string, response: AgentResponse): Promise<void> {
    // Reply is handled inline via ctx.reply in the message handlers
    // This method is for push-initiated messages (e.g., scheduled tasks)
  }

  onMessage(handler: (message: InboundMessage) => Promise<void>): void {
    this.handler = handler;
  }

  // ─── Bot Commands ─────────────────────────────────────
  private commands: Record<string, string> = {
    '/neo': 'Get an existential quote',
    '/sessions': 'List active sessions',
    '/model': 'Switch model tier',
    '/memory': 'Search memory',
    '/skills': 'List installed skills',
    '/help': 'Show available commands',
  };

  private async handleCommand(text: string, ctx: any): Promise<boolean> {
    const [cmd, ...args] = text.split(' ');
    const arg = args.join(' ');

    switch (cmd) {
      case '/help':
        await ctx.reply(
          Object.entries(this.commands)
            .map(([k, v]) => `${k} — ${v}`)
            .join('\n'),
        );
        return true;
      case '/neo':
        await ctx.reply('"There is no spoon." 🥄');
        return true;
      // Other commands delegate to the main handler with metadata
      default:
        return false;
    }
  }

  // ─── Media Download Helpers ───────────────────────────
  private async downloadMedia(ctx: any, type: 'voice' | 'audio'): Promise<Attachment> {
    const media = ctx.message.voice ?? ctx.message.audio;
    const file = await ctx.getFile();
    const localPath = await this.downloadFile(file.file_path!);

    return {
      id: media.file_unique_id,
      type,
      mimeType: media.mime_type ?? 'audio/ogg',
      fileSize: media.file_size ?? 0,
      duration: media.duration,
      localPath,
    };
  }

  private async downloadPhoto(ctx: any, photo: any): Promise<Attachment> {
    const file = await ctx.getFile();
    const localPath = await this.downloadFile(file.file_path!);

    return {
      id: photo.file_unique_id,
      type: 'image',
      mimeType: 'image/jpeg',
      fileSize: photo.file_size ?? 0,
      width: photo.width,
      height: photo.height,
      localPath,
    };
  }

  private async downloadDocument(ctx: any): Promise<Attachment> {
    const doc = ctx.message.document!;
    const file = await ctx.getFile();
    const localPath = await this.downloadFile(file.file_path!);

    return {
      id: doc.file_unique_id,
      type: 'document',
      mimeType: doc.mime_type ?? 'application/octet-stream',
      fileName: doc.file_name,
      fileSize: doc.file_size ?? 0,
      localPath,
    };
  }

  private async downloadFile(filePath: string): Promise<string> {
    const { writeFile, mkdtemp } = await import('fs/promises');
    const { join } = await import('path');
    const { tmpdir } = await import('os');

    const url = `https://api.telegram.org/file/bot${this.token}/${filePath}`;
    const res = await fetch(url);
    const buffer = Buffer.from(await res.arrayBuffer());

    const dir = await mkdtemp(join(tmpdir(), 'neo-tg-'));
    const localPath = join(dir, filePath.split('/').pop()!);
    await writeFile(localPath, buffer);
    return localPath;
  }

  private toInbound(ctx: any, attachments?: Attachment[]): InboundMessage {
    const msg = ctx.message;
    return {
      id: String(msg.message_id),
      channelId: String(msg.chat.id),
      channel: 'telegram',
      userId: String(msg.from?.id ?? ''),
      content: msg.text ?? msg.caption ?? '',
      timestamp: msg.date * 1000,
      sessionKey: `telegram:${msg.chat.id}`,
      attachments,
    };
  }
}
```

---

## 5.5 — Voice Transcription

> _"I hear you, even through the static."_

### `server/src/media/voice-transcriber.ts`

Uses **Groq Whisper** (free tier: 20 req/min, `whisper-large-v3-turbo`, ~2s latency).

```typescript
import { readFile } from 'fs/promises';

export class VoiceTranscriber {
  constructor(private apiKey: string) {}

  async transcribe(localPath: string): Promise<string> {
    // Convert to WAV if needed (Telegram sends OGG/Opus)
    const wavPath = await this.convertToWav(localPath);

    const formData = new FormData();
    formData.append('file', new Blob([await readFile(wavPath)]), 'audio.wav');
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('response_format', 'text');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });

    if (!res.ok) throw new Error(`Groq Whisper ${res.status}: ${await res.text()}`);
    return (await res.text()).trim();
  }

  private async convertToWav(inputPath: string): Promise<string> {
    if (inputPath.endsWith('.wav')) return inputPath;
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const outputPath = inputPath.replace(/\.[^.]+$/, '.wav');
    await execAsync(`ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -f wav "${outputPath}" -y`);
    return outputPath;
  }
}
```

---

## 5.6 — Vision Analyzer

> _"I can see it... the code is everywhere."_

### `server/src/media/vision-analyzer.ts`

Uses **Claude's native vision** (via the existing Claude Bridge) — no separate Groq Vision needed.

```typescript
import { readFile } from 'fs/promises';

export class VisionAnalyzer {
  constructor(private apiKey: string) {}

  async analyze(localPath: string, mimeType: string, prompt?: string): Promise<string> {
    const imageBuffer = await readFile(localPath);
    const base64 = imageBuffer.toString('base64');
    const defaultPrompt =
      'Describe this image in detail. If it contains text, code, diagrams, or data — extract and structure them.';

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.2-90b-vision-preview',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt ?? defaultPrompt },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
            ],
          },
        ],
        max_tokens: 1024,
      }),
    });

    if (!res.ok) throw new Error(`Groq Vision ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.choices[0].message.content;
  }
}
```

---

## 5.7 — Document Reader

### `server/src/media/document-reader.ts`

Reads text files directly, PDFs via `pdf-parse`, CSV/TSV with row cap.

```typescript
import { readFile } from 'fs/promises';
import path from 'path';

export class DocumentReader {
  async extract(localPath: string, fileName?: string): Promise<string> {
    const ext = path.extname(fileName ?? localPath).toLowerCase();

    // Code & text files — direct read
    if (this.isTextFile(ext)) {
      return readFile(localPath, 'utf-8');
    }

    // PDF — pdf-parse (lightweight, no external API)
    if (ext === '.pdf') {
      const pdfParse = (await import('pdf-parse')).default;
      const buffer = await readFile(localPath);
      const data = await pdfParse(buffer);
      return data.text;
    }

    // CSV/TSV — direct read with row cap
    if (['.csv', '.tsv'].includes(ext)) {
      const content = await readFile(localPath, 'utf-8');
      const lines = content.split('\n').slice(0, 100);
      return `[CSV Data — ${lines.length} rows]:\n${lines.join('\n')}`;
    }

    return `[Unsupported file type: ${ext}]`;
  }

  private isTextFile(ext: string): boolean {
    return [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.py',
      '.rb',
      '.go',
      '.rs',
      '.md',
      '.txt',
      '.json',
      '.yaml',
      '.yml',
      '.toml',
      '.xml',
      '.html',
      '.css',
      '.sql',
      '.sh',
      '.env',
      '.gitignore',
    ].includes(ext);
  }
}
```

---

## 5.8 — Media Processor (Orchestrator)

### `server/src/media/media-processor.ts`

Central orchestrator. Processes all attachments **before** the guardrail pipeline.

```typescript
import type { InboundMessage, Attachment } from '@neo-agent/shared';
import { VoiceTranscriber } from './voice-transcriber.js';
import { VisionAnalyzer } from './vision-analyzer.js';
import { DocumentReader } from './document-reader.js';

export interface MediaConfig {
  groqApiKey: string;
  maxVoiceDurationSeconds: number; // Default: 300
  maxImageSizeMb: number; // Default: 10
  maxDocumentSizeMb: number; // Default: 25
  tempDir: string; // Default: /tmp/neo-media
  cleanupAfterMinutes: number; // Default: 30
}

export class MediaProcessor {
  private voiceTranscriber: VoiceTranscriber;
  private visionAnalyzer: VisionAnalyzer;
  private documentReader: DocumentReader;

  constructor(private config: MediaConfig) {
    this.voiceTranscriber = new VoiceTranscriber(config.groqApiKey);
    this.visionAnalyzer = new VisionAnalyzer(config.groqApiKey);
    this.documentReader = new DocumentReader();
  }

  async process(message: InboundMessage): Promise<InboundMessage> {
    if (!message.attachments?.length) return message;

    const enriched = { ...message };
    const contentParts: string[] = message.content ? [message.content] : [];

    for (const attachment of enriched.attachments!) {
      switch (attachment.type) {
        case 'voice':
        case 'audio': {
          const transcription = await this.voiceTranscriber.transcribe(attachment.localPath!);
          attachment.transcription = transcription;
          contentParts.push(`[Voice message]: ${transcription}`);
          break;
        }
        case 'image': {
          const analysis = await this.visionAnalyzer.analyze(
            attachment.localPath!,
            attachment.mimeType,
          );
          attachment.analysis = analysis;
          contentParts.push(`[Image: ${attachment.fileName ?? 'photo'}]: ${analysis}`);
          break;
        }
        case 'document': {
          const text = await this.documentReader.extract(
            attachment.localPath!,
            attachment.fileName,
          );
          attachment.analysis = text;
          contentParts.push(`[Document: ${attachment.fileName}]:\n${text}`);
          break;
        }
      }
    }

    enriched.content = contentParts.filter(Boolean).join('\n\n');
    return enriched;
  }
}
```

---

## 5.9 — Integration

### Agent Loop — `server/src/core/agent.ts`

Media processing inserts as step 0, before guardrails:

```typescript
// In NeoAgent._executeLoop()
private async _executeLoop(message: InboundMessage): Promise<AgentResponse> {
  // 0. Media processing (voice → text, image/file → analysis)
  const enriched = this.mediaProcessor
    ? await this.mediaProcessor.process(message)
    : message;

  // 1. Guardrails (now with transcribed text)
  const sanitized = await this.guardrails.process(enriched);
  // ... rest of pipeline
}
```

### Server Bootstrap — `server/src/index.ts`

```typescript
// Channel registration
import { WebChannel } from './channels/web.js';
import { TelegramChannel } from './channels/telegram.js';

const webChannel = new WebChannel(WS_PORT, WS_TOKEN);
await webChannel.start();

if (process.env.TELEGRAM_BOT_TOKEN) {
  const tgChannel = new TelegramChannel(process.env.TELEGRAM_BOT_TOKEN);
  await tgChannel.start();
}
```

### Environment Variables

```env
GROQ_API_KEY=gsk_...               # Free tier — Whisper + Vision
TELEGRAM_BOT_TOKEN=                 # Optional — enable Telegram channel
```

---

## Test Suite

### `server/tests/phase-5/channel-adapter.test.ts`

```typescript
describe('CliChannel', () => {
  it('toInbound() creates valid InboundMessage with sessionKey cli:local');
  it('extractFileAttachments() returns attachment for valid file path');
  it('extractFileAttachments() returns empty for non-existent path');
  it('inferType() maps extensions correctly');
});

describe('WebChannel', () => {
  it('rejects connections without valid token');
  it('toInbound() derives sessionKey as web:userId');
  it('processUploads() saves base64 files to temp directory');
  it('each message gets a unique id');
});

describe('TelegramChannel', () => {
  it('toInbound() derives sessionKey as telegram:chatId');
  it('handles /help command and returns true');
  it('passes unknown commands as regular messages');
  it('downloadFile() saves remote file to temp directory');
});
```

### `server/tests/phase-5/media-processor.test.ts`

```typescript
describe('MediaProcessor', () => {
  it('passes through messages without attachments');
  it('transcribes voice and appends [Voice message] to content');
  it('analyzes image and appends [Image] to content');
  it('reads document and appends [Document] to content');
  it('handles multiple attachments in one message');
});

describe('VoiceTranscriber', () => {
  it('calls Groq Whisper API with file and returns text');
  it('throws on API error');
});

describe('VisionAnalyzer', () => {
  it('calls Groq Vision API with base64 image and returns description');
  it('uses custom prompt when provided');
  it('throws on API error');
});

describe('DocumentReader', () => {
  it('reads .ts files directly via fs');
  it('reads .pdf files via pdf-parse');
  it('reads .csv files with 100-row cap');
  it('returns unsupported message for unknown formats');
});
```

---

## Acceptance Criteria

- [ ] `ChannelAdapter` interface implemented by CLI, Web, and Telegram
- [ ] WebSocket channel has token auth (rejects invalid tokens with 4001)
- [ ] Telegram bot starts via Grammy polling when `TELEGRAM_BOT_TOKEN` is set
- [ ] Telegram handles text, voice, photo, and document messages
- [ ] Voice notes transcribed via Groq Whisper before agent processing
- [ ] Images analyzed via Groq Vision (Llama 3.2 90B)
- [ ] PDF files parsed via `pdf-parse` (no external API)
- [ ] Code/text files read directly
- [ ] CSV/TSV files read with 100-row cap
- [ ] Media attachments enriched into `InboundMessage.content`
- [ ] Unsupported file types return graceful message
- [ ] All tests pass, build clean

---

## Dependencies

```json
{
  "dependencies": {
    "grammy": "^1.x",
    "pdf-parse": "^1.1.1"
  },
  "system": {
    "ffmpeg": "Required for audio conversion (brew install ffmpeg)"
  }
}
```

---

## Files Created

```text
packages/shared/src/
└── index.ts                          ← MODIFY (Attachment types, InboundMessage)

server/src/channels/
├── interface.ts                      ← NEW (ChannelAdapter interface)
├── cli.ts                            ← NEW (CLI channel adapter)
├── web.ts                            ← NEW (WebSocket channel)
└── telegram.ts                       ← NEW (Grammy Telegram bot)

server/src/media/
├── media-processor.ts                ← NEW (orchestrator + MediaConfig)
├── voice-transcriber.ts              ← NEW (Groq Whisper)
├── vision-analyzer.ts                ← NEW (Groq Vision)
└── document-reader.ts                ← NEW (pdf-parse + direct read)

server/src/core/
└── agent.ts                          ← MODIFY (add media step 0)

server/src/index.ts                   ← MODIFY (wire channels)

server/tests/phase-5/
├── channel-adapter.test.ts           ← NEW
└── media-processor.test.ts           ← NEW
```
