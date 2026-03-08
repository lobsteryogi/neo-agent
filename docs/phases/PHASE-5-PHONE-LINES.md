# Phase 5 — Phone Lines (Telegram + Channels + Media Intelligence)

> _"There is no spoon... but there are notifications."_

**Goal**: Build the multi-channel architecture, Telegram bot integration via Composio, voice note transcription, and file/image understanding pipeline.

**Estimated time**: 8-12 hours
**Prerequisites**: Phase 1 complete (agent loop), Phase 3 (Composio integration)

---

## 5.1 — Channel Interface

### `server/src/channels/interface.ts`

All channels implement the same adapter interface:

```typescript
export interface ChannelAdapter {
  name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  send(sessionId: string, response: AgentResponse): Promise<void>;
  onMessage(handler: (message: InboundMessage) => Promise<void>): void;
}

export interface InboundMessage {
  id: string;
  channelId: string;
  channel: 'telegram' | 'web' | 'cli';
  userId: string;
  content: string;
  timestamp: number;
  sessionKey: string; // Derived: channel:userId
  attachments?: Attachment[]; // Voice notes, files, images
  metadata?: Record<string, unknown>;
}

export type AttachmentType = 'voice' | 'image' | 'document' | 'video' | 'audio';

export interface Attachment {
  id: string;
  type: AttachmentType;
  mimeType: string;
  fileName?: string;
  fileSize: number; // bytes
  url?: string; // Remote URL (Telegram CDN, etc.)
  localPath?: string; // After download to temp storage
  duration?: number; // For voice/audio/video (seconds)
  width?: number; // For images/video
  height?: number; // For images/video
  transcription?: string; // Populated after voice transcription
  analysis?: string; // Populated after image/document analysis
}
```

---

## 5.2 — Telegram Channel

### `server/src/channels/telegram.ts`

Using Composio's Telegram toolkit:

```typescript
export class TelegramChannel implements ChannelAdapter {
  name = 'telegram';

  async start() {
    const tools = await this.composio.tools.get(this.userId, { toolkits: ['TELEGRAM'] });
    // Register webhook or polling handler
    // Map Telegram chat ID → sessionKey
  }

  // Bot commands
  private commands = {
    '/doit': (msg) => this.agent.approveGate(msg.sessionKey),
    '/memory': (msg) => this.agent.searchMemory(msg.text),
    '/sessions': (msg) => this.agent.listSessions(),
    '/model': (msg) => this.agent.switchModel(msg.text),
    '/skills': (msg) => this.agent.listSkills(),
    '/describe': (msg) => this.agent.describeAttachment(msg), // Analyze attached file/image
    '/neo': (msg) => this.getExistentialQuote(),
  };

  // Handle incoming media (voice, photo, document)
  private async handleMedia(telegramMsg: TelegramUpdate): Promise<Attachment[]> {
    const attachments: Attachment[] = [];

    if (telegramMsg.voice || telegramMsg.audio) {
      const media = telegramMsg.voice ?? telegramMsg.audio!;
      const file = await this.downloadFile(media.file_id);
      attachments.push({
        id: media.file_unique_id,
        type: telegramMsg.voice ? 'voice' : 'audio',
        mimeType: media.mime_type ?? 'audio/ogg',
        fileSize: media.file_size,
        duration: media.duration,
        localPath: file.localPath,
      });
    }

    if (telegramMsg.photo) {
      // Telegram sends multiple sizes — use the largest
      const largest = telegramMsg.photo[telegramMsg.photo.length - 1];
      const file = await this.downloadFile(largest.file_id);
      attachments.push({
        id: largest.file_unique_id,
        type: 'image',
        mimeType: 'image/jpeg',
        fileSize: largest.file_size,
        width: largest.width,
        height: largest.height,
        localPath: file.localPath,
      });
    }

    if (telegramMsg.document) {
      const file = await this.downloadFile(telegramMsg.document.file_id);
      attachments.push({
        id: telegramMsg.document.file_unique_id,
        type: 'document',
        mimeType: telegramMsg.document.mime_type ?? 'application/octet-stream',
        fileName: telegramMsg.document.file_name,
        fileSize: telegramMsg.document.file_size,
        localPath: file.localPath,
      });
    }

    return attachments;
  }
}
```

---

## 5.3 — Web Channel (Dashboard WebSocket)

### `server/src/channels/web.ts`

```typescript
export class WebChannel implements ChannelAdapter {
  name = 'web';

  start() {
    this.wss.on('connection', (ws, req) => {
      // Token auth (Audit Fix M4)
      const token = new URL(req.url!, `http://${req.headers.host}`).searchParams.get('token');
      if (token !== this.config.wsToken) return ws.close(4001);

      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'message') this.handler(this.toInbound(msg, ws));
        if (msg.type === 'upload') this.handleFileUpload(msg, ws); // Handle file/image/voice uploads
        if (msg.type === 'gate:approve') this.agent.approveGate(msg.sessionKey);
      });
    });
  }

  private async handleFileUpload(msg: any, ws: WebSocket): Promise<void> {
    const buffer = Buffer.from(msg.data, 'base64');
    const localPath = await this.saveTempFile(buffer, msg.fileName);
    const attachment: Attachment = {
      id: crypto.randomUUID(),
      type: this.inferType(msg.mimeType),
      mimeType: msg.mimeType,
      fileName: msg.fileName,
      fileSize: buffer.length,
      localPath,
    };
    const inbound = this.toInbound({ ...msg, attachments: [attachment] }, ws);
    this.handler(inbound);
  }
}
```

---

## 5.4 — CLI Channel

### `server/src/channels/cli.ts`

Interactive terminal mode using readline:

```typescript
export class CliChannel implements ChannelAdapter {
  name = 'cli';

  async start() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.setPrompt('\x1b[32mNeo>\x1b[0m '); // Green prompt
    rl.prompt();
    rl.on('line', async (line) => {
      // Support file paths: "analyze /path/to/file.pdf" or "transcribe /path/to/voice.ogg"
      const attachments = await this.extractFileAttachments(line);
      this.handler(this.toInbound(line, attachments));
      rl.prompt();
    });
  }

  private async extractFileAttachments(line: string): Promise<Attachment[]> {
    const fileMatch = line.match(/(?:analyze|transcribe|read|describe)\s+(.+)/i);
    if (!fileMatch) return [];

    const filePath = fileMatch[1].trim();
    if (!fs.existsSync(filePath)) return [];

    const stat = fs.statSync(filePath);
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';
    return [
      {
        id: crypto.randomUUID(),
        type: this.inferType(mimeType),
        mimeType,
        fileName: path.basename(filePath),
        fileSize: stat.size,
        localPath: filePath,
      },
    ];
  }
}
```

---

## 5.5 — Voice Transcription Pipeline

> _"I hear you, even through the static."_

### Overview

When a user sends a voice note (Telegram voice message, uploaded audio file, or CLI audio path), the agent transcribes it to text before processing. The transcription is injected as `content` into the `InboundMessage` so the agent loop handles it like any text message.

### `server/src/media/voice-transcriber.ts`

Uses **Groq Whisper** API (free tier: 20 req/min, Whisper Large v3 Turbo, ~2s latency).

```typescript
import { readFile } from 'fs/promises';
import { execAsync } from '../utils/exec';

export class VoiceTranscriber {
  constructor(private apiKey: string) {}

  async transcribe(attachment: Attachment): Promise<string> {
    // 1. Convert to WAV if needed (Telegram sends OGG/Opus)
    const wavPath = await this.convertToWav(attachment.localPath!);

    // 2. Transcribe via Groq Whisper
    const formData = new FormData();
    formData.append('file', new Blob([await readFile(wavPath)]), 'audio.wav');
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('language', 'en'); // Auto-detect if omitted
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
    const outputPath = inputPath.replace(/\.[^.]+$/, '.wav');
    await execAsync(`ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -f wav "${outputPath}" -y`);
    return outputPath;
  }
}
```

### Integration with Agent Loop

Voice transcription is integrated as a middleware step **before** the guardrail pipeline:

```typescript
// In NeoAgent._executeLoop()
private async _executeLoop(message: InboundMessage): Promise<AgentResponse> {
  // 0. Media processing (voice → text, image/file → analysis)
  const enriched = await this.mediaProcessor.process(message);

  // 1. Guardrails (now with transcribed text)
  const sanitized = await this.guardrails.process(enriched);
  // ... rest of the pipeline
}
```

---

## 5.6 — File & Image Understanding Pipeline

> _"I can see it... the code is everywhere."_

### Overview

Neo can receive and understand files (PDF, DOCX, CSV, code) and images (screenshots, diagrams, photos) sent through any channel. This uses **Groq Vision** for image analysis and **LlamaParse** for document parsing.

### Architecture

```text
Attachment received
       │
       ├─ Image? ──────────→ Groq Vision API (LLaVA)
       │                            │
       │                            └→ analysis text → InboundMessage.attachments[].analysis
       │
       ├─ Document? ────────→ LlamaParse API
       │                            │
       │                            └→ extracted text → InboundMessage.content (appended)
       │
       └─ Code file? ───────→ Direct read → InboundMessage.content (appended)
```

### `server/src/media/media-processor.ts`

Central orchestrator for all media types:

```typescript
export class MediaProcessor {
  private voiceTranscriber: VoiceTranscriber;
  private visionAnalyzer: VisionAnalyzer;
  private documentReader: DocumentReader;

  async process(message: InboundMessage): Promise<InboundMessage> {
    if (!message.attachments?.length) return message;

    const enriched = { ...message };
    const contentParts: string[] = [message.content];

    for (const attachment of enriched.attachments!) {
      switch (attachment.type) {
        case 'voice':
        case 'audio': {
          const transcription = await this.voiceTranscriber.transcribe(attachment);
          attachment.transcription = transcription;
          contentParts.push(`[Voice message]: ${transcription}`);
          break;
        }
        case 'image': {
          const analysis = await this.visionAnalyzer.analyze(attachment);
          attachment.analysis = analysis;
          contentParts.push(`[Image: ${attachment.fileName ?? 'photo'}]: ${analysis}`);
          break;
        }
        case 'document': {
          const text = await this.documentReader.extract(attachment);
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

### `server/src/media/vision-analyzer.ts`

Uses **Groq Vision** API (free tier, `llava-v1.5-7b-4096-preview`).

```typescript
import { readFile } from 'fs/promises';

export class VisionAnalyzer {
  constructor(private apiKey: string) {}

  async analyze(attachment: Attachment, prompt?: string): Promise<string> {
    const imageBuffer = await readFile(attachment.localPath!);
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
        model: 'llava-v1.5-7b-4096-preview',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt ?? defaultPrompt },
              {
                type: 'image_url',
                image_url: { url: `data:${attachment.mimeType};base64,${base64}` },
              },
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

### `server/src/media/document-reader.ts`

Uses **LlamaParse** API (free tier: 1000 pages/day). Returns structured markdown from PDF, DOCX, PPTX, XLSX. Code/text files are read directly via `fs.readFile`.

```typescript
import { LlamaParseReader } from 'llamaindex';
import { readFile } from 'fs/promises';
import path from 'path';

export class DocumentReader {
  constructor(private apiKey: string) {}

  async extract(attachment: Attachment): Promise<string> {
    const ext = path.extname(attachment.fileName ?? '').toLowerCase();

    // Code & text files — direct read
    if (this.isTextFile(ext)) {
      return await readFile(attachment.localPath!, 'utf-8');
    }

    // PDF, DOCX, PPTX, XLSX — LlamaParse
    if (this.isDocumentFile(ext)) {
      const reader = new LlamaParseReader({
        apiKey: this.apiKey,
        resultType: 'markdown',
      });
      const documents = await reader.loadData(attachment.localPath!);
      return documents.map((doc) => doc.getText()).join('\n\n');
    }

    // CSV/TSV — direct read with row cap
    if (['.csv', '.tsv'].includes(ext)) {
      const content = await readFile(attachment.localPath!, 'utf-8');
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
      '.env.example',
      '.gitignore',
    ].includes(ext);
  }

  private isDocumentFile(ext: string): boolean {
    return ['.pdf', '.docx', '.doc', '.pptx', '.xlsx'].includes(ext);
  }
}
```

---

## 5.7 — Configuration

### `server/src/config/media.ts`

```typescript
export interface MediaConfig {
  groqApiKey: string; // Groq free tier — 20 req/min (Whisper + Vision)
  llamaParseApiKey: string; // LlamaParse free tier — 1000 pages/day
  maxVoiceDurationSeconds: number; // Default: 300 (5 min)
  maxImageSizeMb: number; // Default: 10
  maxDocumentSizeMb: number; // Default: 25
  tempDir: string; // Default: /tmp/neo-media
  cleanupAfterMinutes: number; // Default: 30
}
```

### Environment Variables

```env
GROQ_API_KEY=gsk_...               # Free tier — Whisper transcription + Vision analysis
LLAMA_PARSE_API_KEY=llx-...        # Free tier — 1000 pages/day document parsing
```

---

## Test Suite

### `server/tests/phase-5/channel-adapter.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { TelegramChannel } from '../../src/channels/telegram';
import { WebChannel } from '../../src/channels/web';
import { CliChannel } from '../../src/channels/cli';

describe('Channel Adapter Interface', () => {
  const channels = [
    new TelegramChannel(mockConfig, mockComposio),
    new WebChannel(mockConfig, mockWss),
    new CliChannel(mockConfig),
  ];

  it('all channels implement start() and stop()', () => {
    for (const channel of channels) {
      expect(typeof channel.start).toBe('function');
      expect(typeof channel.stop).toBe('function');
    }
  });

  it('all channels implement send()', () => {
    for (const channel of channels) {
      expect(typeof channel.send).toBe('function');
    }
  });

  it('all channels have a name property', () => {
    expect(channels.map((c) => c.name)).toEqual(['telegram', 'web', 'cli']);
  });
});

describe('InboundMessage Transformation', () => {
  it('WebChannel derives sessionKey as channel:userId', () => {
    const web = new WebChannel(mockConfig, mockWss);
    const msg = web['toInbound']({ text: 'Hello', userId: 'user-123' });
    expect(msg.sessionKey).toBe('web:user-123');
    expect(msg.channel).toBe('web');
  });

  it('TelegramChannel derives sessionKey from chatId', () => {
    const tg = new TelegramChannel(mockConfig, mockComposio);
    const msg = tg['toInbound']({ text: 'Hello', chatId: 'chat-456' });
    expect(msg.sessionKey).toBe('telegram:chat-456');
  });

  it('CliChannel uses fixed sessionKey', () => {
    const cli = new CliChannel(mockConfig);
    const msg = cli['toInbound']('Hello');
    expect(msg.sessionKey).toBe('cli:local');
  });

  it('all messages have a unique id', () => {
    const web = new WebChannel(mockConfig, mockWss);
    const msg1 = web['toInbound']({ text: 'a', userId: '1' });
    const msg2 = web['toInbound']({ text: 'b', userId: '1' });
    expect(msg1.id).not.toBe(msg2.id);
  });

  it('timestamp is set to current time', () => {
    const web = new WebChannel(mockConfig, mockWss);
    const before = Date.now();
    const msg = web['toInbound']({ text: 'test', userId: '1' });
    const after = Date.now();
    expect(msg.timestamp).toBeGreaterThanOrEqual(before);
    expect(msg.timestamp).toBeLessThanOrEqual(after);
  });

  it('preserves attachments in InboundMessage', () => {
    const web = new WebChannel(mockConfig, mockWss);
    const attachment: Attachment = {
      id: 'att-1',
      type: 'image',
      mimeType: 'image/jpeg',
      fileSize: 1024,
      localPath: '/tmp/test.jpg',
    };
    const msg = web['toInbound']({ text: 'Look at this', userId: '1', attachments: [attachment] });
    expect(msg.attachments).toHaveLength(1);
    expect(msg.attachments![0].type).toBe('image');
  });
});

describe('Telegram Bot Commands', () => {
  it('/doit triggers gate approval', async () => {
    const tg = new TelegramChannel(mockConfig, mockComposio);
    const agent = { approveGate: vi.fn() };
    tg['agent'] = agent;
    await tg['handleCommand']('/doit', { sessionKey: 'telegram:123' });
    expect(agent.approveGate).toHaveBeenCalledWith('telegram:123');
  });

  it('/memory searches memory', async () => {
    const tg = new TelegramChannel(mockConfig, mockComposio);
    const agent = { searchMemory: vi.fn().mockResolvedValue([]) };
    tg['agent'] = agent;
    await tg['handleCommand']('/memory TypeScript', { sessionKey: 'telegram:123' });
    expect(agent.searchMemory).toHaveBeenCalledWith('TypeScript');
  });

  it('/sessions returns session list', async () => {
    const tg = new TelegramChannel(mockConfig, mockComposio);
    const agent = { listSessions: vi.fn().mockResolvedValue([]) };
    tg['agent'] = agent;
    await tg['handleCommand']('/sessions', { sessionKey: 'telegram:123' });
    expect(agent.listSessions).toHaveBeenCalled();
  });

  it('/describe triggers attachment analysis', async () => {
    const tg = new TelegramChannel(mockConfig, mockComposio);
    const agent = { describeAttachment: vi.fn().mockResolvedValue('A cat photo') };
    tg['agent'] = agent;
    const msg = { sessionKey: 'telegram:123', attachments: [{ type: 'image' }] };
    await tg['handleCommand']('/describe', msg);
    expect(agent.describeAttachment).toHaveBeenCalled();
  });

  it('unknown commands pass through as regular messages', async () => {
    const tg = new TelegramChannel(mockConfig, mockComposio);
    const handler = vi.fn();
    tg.onMessage(handler);
    await tg['handleMessage']({ text: '/notacommand test', chatId: '123' });
    expect(handler).toHaveBeenCalled();
  });
});
```

### `server/tests/phase-5/voice-transcriber.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { VoiceTranscriber } from '../../src/media/voice-transcriber';

describe('VoiceTranscriber', () => {
  it('transcribes voice attachment via Groq and returns text', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('Hello world'),
    });
    const transcriber = new VoiceTranscriber('test-key');
    const result = await transcriber.transcribe({
      id: '1',
      type: 'voice',
      mimeType: 'audio/ogg',
      fileSize: 1024,
      localPath: '/tmp/test.ogg',
    });
    expect(result).toBe('Hello world');
    expect(fetch).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/audio/transcriptions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws on Groq API error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Rate limited'),
    });
    const transcriber = new VoiceTranscriber('test-key');
    await expect(
      transcriber.transcribe({
        id: '1',
        type: 'voice',
        mimeType: 'audio/ogg',
        fileSize: 1024,
        localPath: '/tmp/test.ogg',
      }),
    ).rejects.toThrow('Groq Whisper 429');
  });
});
```

### `server/tests/phase-5/media-processor.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { MediaProcessor } from '../../src/media/media-processor';

describe('MediaProcessor', () => {
  it('passes through messages without attachments', async () => {
    const processor = new MediaProcessor(mockConfig);
    const msg = { content: 'Hello', attachments: undefined };
    const result = await processor.process(msg as any);
    expect(result.content).toBe('Hello');
  });

  it('transcribes voice attachments and appends to content', async () => {
    const processor = new MediaProcessor(mockConfig);
    vi.spyOn(processor['voiceTranscriber'], 'transcribe').mockResolvedValue('Hello from voice');
    const msg = {
      content: '',
      attachments: [
        { id: '1', type: 'voice', mimeType: 'audio/ogg', fileSize: 1024, localPath: '/tmp/v.ogg' },
      ],
    };
    const result = await processor.process(msg as any);
    expect(result.content).toContain('[Voice message]: Hello from voice');
    expect(result.attachments![0].transcription).toBe('Hello from voice');
  });

  it('analyzes image attachments and appends to content', async () => {
    const processor = new MediaProcessor(mockConfig);
    vi.spyOn(processor['visionAnalyzer'], 'analyze').mockResolvedValue('A screenshot of code');
    const msg = {
      content: 'What is this?',
      attachments: [
        {
          id: '1',
          type: 'image',
          mimeType: 'image/png',
          fileSize: 2048,
          localPath: '/tmp/img.png',
        },
      ],
    };
    const result = await processor.process(msg as any);
    expect(result.content).toContain('What is this?');
    expect(result.content).toContain('[Image: photo]: A screenshot of code');
  });

  it('reads document attachments and appends text', async () => {
    const processor = new MediaProcessor(mockConfig);
    vi.spyOn(processor['documentReader'], 'extract').mockResolvedValue('Document content here');
    const msg = {
      content: 'Summarize this',
      attachments: [
        {
          id: '1',
          type: 'document',
          mimeType: 'application/pdf',
          fileName: 'report.pdf',
          fileSize: 4096,
          localPath: '/tmp/report.pdf',
        },
      ],
    };
    const result = await processor.process(msg as any);
    expect(result.content).toContain('[Document: report.pdf]');
    expect(result.content).toContain('Document content here');
  });

  it('handles multiple attachments in one message', async () => {
    const processor = new MediaProcessor(mockConfig);
    vi.spyOn(processor['voiceTranscriber'], 'transcribe').mockResolvedValue('Voice text');
    vi.spyOn(processor['visionAnalyzer'], 'analyze').mockResolvedValue('Image desc');
    const msg = {
      content: '',
      attachments: [
        { id: '1', type: 'voice', mimeType: 'audio/ogg', fileSize: 1024, localPath: '/tmp/v.ogg' },
        { id: '2', type: 'image', mimeType: 'image/png', fileSize: 2048, localPath: '/tmp/i.png' },
      ],
    };
    const result = await processor.process(msg as any);
    expect(result.content).toContain('[Voice message]');
    expect(result.content).toContain('[Image');
  });
});

describe('VisionAnalyzer', () => {
  it('sends image to Groq Vision API and returns description', async () => {
    const { VisionAnalyzer } = await import('../../src/media/vision-analyzer');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'A cat photo' } }] }),
    });
    const analyzer = new VisionAnalyzer('test-key');
    const result = await analyzer.analyze({
      id: '1',
      type: 'image',
      mimeType: 'image/jpeg',
      fileSize: 1024,
      localPath: '/tmp/cat.jpg',
    });
    expect(result).toBe('A cat photo');
  });
});

describe('DocumentReader', () => {
  it('reads text files directly', async () => {
    const { DocumentReader } = await import('../../src/media/document-reader');
    const reader = new DocumentReader('test-key');
    vi.spyOn(require('fs/promises'), 'readFile').mockResolvedValue('const x = 1;');
    const result = await reader.extract({
      id: '1',
      type: 'document',
      mimeType: 'text/typescript',
      fileName: 'index.ts',
      fileSize: 128,
      localPath: '/tmp/index.ts',
    });
    expect(result).toBe('const x = 1;');
  });

  it('returns unsupported message for unknown formats', async () => {
    const { DocumentReader } = await import('../../src/media/document-reader');
    const reader = new DocumentReader('test-key');
    const result = await reader.extract({
      id: '1',
      type: 'document',
      mimeType: 'application/x-unknown',
      fileName: 'data.xyz',
      fileSize: 512,
      localPath: '/tmp/data.xyz',
    });
    expect(result).toContain('Unsupported');
  });
});
```

---

## Acceptance Criteria

- [ ] All 3 channels (Telegram, Web, CLI) send/receive through same agent loop
- [ ] Telegram bot responds to all 7 commands (including `/describe`)
- [ ] WebSocket has token auth
- [ ] CLI shows green Neo prompt with streaming response
- [ ] Channel-specific metadata preserved in `InboundMessage`
- [ ] Voice notes from Telegram are transcribed via Groq Whisper before agent processing
- [ ] Images sent via any channel are analyzed via Groq Vision
- [ ] PDF, DOCX, PPTX, XLSX files are parsed via LlamaParse
- [ ] Code/text files are read directly and included in message content
- [ ] CSV/TSV files are read with 100-row cap
- [ ] All media attachments are cleaned up from temp storage after 30 minutes
- [ ] Unsupported file types return a graceful error message

---

## Dependencies

```json
{
  "dependencies": {
    "llamaindex": "^0.5.x",
    "mime-types": "^2.1.35"
  },
  "system": {
    "ffmpeg": "Required for audio conversion (brew install ffmpeg)"
  }
}
```

---

## Files Created

```text
server/src/channels/
├── interface.ts              ← UPDATED (Attachment types)
├── telegram.ts               ← UPDATED (media handling)
├── web.ts                    ← UPDATED (file upload support)
└── cli.ts                    ← UPDATED (file path extraction)

server/src/media/
├── media-processor.ts        ← NEW (orchestrator)
├── voice-transcriber.ts      ← NEW (Groq Whisper)
├── vision-analyzer.ts        ← NEW (Groq Vision)
└── document-reader.ts        ← NEW (LlamaParse)

server/src/config/
└── media.ts                  ← NEW (MediaConfig)

server/tests/phase-5/
├── channel-adapter.test.ts   ← UPDATED (attachment tests)
├── voice-transcriber.test.ts ← NEW
└── media-processor.test.ts   ← NEW
```
