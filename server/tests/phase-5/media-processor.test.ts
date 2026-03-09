import type { Attachment, InboundMessage } from '@neo-agent/shared';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentReader } from '../../src/media/document-reader';
import { MediaProcessor } from '../../src/media/media-processor';
import { VisionAnalyzer } from '../../src/media/vision-analyzer';
import { VoiceTranscriber } from '../../src/media/voice-transcriber';

const mockConfig = {
  groqApiKey: 'test-key',
  maxVoiceDurationSeconds: 300,
  maxImageSizeMb: 10,
  maxDocumentSizeMb: 25,
  tempDir: '/tmp/neo-media',
  cleanupAfterMinutes: 30,
};

function makeMessage(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    id: 'msg-1',
    channelId: 'cli',
    channel: 'cli',
    userId: 'local',
    content: '',
    timestamp: Date.now(),
    sessionKey: 'cli:local',
    ...overrides,
  };
}

// ─── Temp file helpers ────────────────────────────────────────

const testDir = join(tmpdir(), `neo-test-${Date.now()}`);

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

// ─── MediaProcessor ───────────────────────────────────────────

describe('MediaProcessor', () => {
  it('passes through messages without attachments', async () => {
    const processor = new MediaProcessor(mockConfig);
    const msg = makeMessage({ content: 'Hello' });
    const result = await processor.process(msg);
    expect(result.content).toBe('Hello');
  });

  it('passes through messages with undefined attachments', async () => {
    const processor = new MediaProcessor(mockConfig);
    const msg = makeMessage({ content: 'Hi', attachments: undefined });
    const result = await processor.process(msg);
    expect(result.content).toBe('Hi');
  });

  it('passes through messages with empty attachments array', async () => {
    const processor = new MediaProcessor(mockConfig);
    const msg = makeMessage({ content: 'Hi', attachments: [] });
    const result = await processor.process(msg);
    expect(result.content).toBe('Hi');
  });

  it('transcribes voice attachments and appends to content', async () => {
    const processor = new MediaProcessor(mockConfig);
    vi.spyOn(processor['voiceTranscriber'], 'transcribe').mockResolvedValue('Hello from voice');

    const msg = makeMessage({
      attachments: [
        {
          id: '1',
          type: 'voice',
          mimeType: 'audio/ogg',
          fileSize: 1024,
          localPath: '/tmp/v.ogg',
        },
      ],
    });

    const result = await processor.process(msg);
    expect(result.content).toContain('[Voice message]: Hello from voice');
    expect(result.attachments![0].transcription).toBe('Hello from voice');
  });

  it('analyzes image attachments and appends to content', async () => {
    const processor = new MediaProcessor(mockConfig);
    vi.spyOn(processor['visionAnalyzer'], 'analyze').mockResolvedValue('A screenshot of code');

    const msg = makeMessage({
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
    });

    const result = await processor.process(msg);
    expect(result.content).toContain('What is this?');
    expect(result.content).toContain('[Image: photo]: A screenshot of code');
    expect(result.attachments![0].analysis).toBe('A screenshot of code');
  });

  it('reads document attachments and appends text', async () => {
    const processor = new MediaProcessor(mockConfig);
    vi.spyOn(processor['documentReader'], 'extract').mockResolvedValue('Document content here');

    const msg = makeMessage({
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
    });

    const result = await processor.process(msg);
    expect(result.content).toContain('[Document: report.pdf]');
    expect(result.content).toContain('Document content here');
    expect(result.attachments![0].analysis).toBe('Document content here');
  });

  it('handles multiple attachments in one message', async () => {
    const processor = new MediaProcessor(mockConfig);
    vi.spyOn(processor['voiceTranscriber'], 'transcribe').mockResolvedValue('Voice text');
    vi.spyOn(processor['visionAnalyzer'], 'analyze').mockResolvedValue('Image desc');

    const msg = makeMessage({
      attachments: [
        { id: '1', type: 'voice', mimeType: 'audio/ogg', fileSize: 1024, localPath: '/tmp/v.ogg' },
        { id: '2', type: 'image', mimeType: 'image/png', fileSize: 2048, localPath: '/tmp/i.png' },
      ],
    });

    const result = await processor.process(msg);
    expect(result.content).toContain('[Voice message]');
    expect(result.content).toContain('[Image');
  });

  it('rejects voice messages exceeding max duration', async () => {
    const processor = new MediaProcessor(mockConfig);
    const msg = makeMessage({
      attachments: [
        {
          id: '1',
          type: 'voice',
          mimeType: 'audio/ogg',
          fileSize: 1024,
          localPath: '/tmp/v.ogg',
          duration: 600,
        },
      ],
    });

    const result = await processor.process(msg);
    expect(result.content).toContain('too long');
    expect(result.content).toContain('600s');
  });

  it('rejects images exceeding max size', async () => {
    const processor = new MediaProcessor(mockConfig);
    const msg = makeMessage({
      attachments: [
        {
          id: '1',
          type: 'image',
          mimeType: 'image/png',
          fileSize: 15 * 1024 * 1024,
          localPath: '/tmp/big.png',
        },
      ],
    });

    const result = await processor.process(msg);
    expect(result.content).toContain('too large');
  });

  it('handles processing errors gracefully', async () => {
    const processor = new MediaProcessor(mockConfig);
    vi.spyOn(processor['voiceTranscriber'], 'transcribe').mockRejectedValue(new Error('API down'));

    const msg = makeMessage({
      attachments: [
        {
          id: '1',
          type: 'voice',
          mimeType: 'audio/ogg',
          fileSize: 1024,
          localPath: '/tmp/v.ogg',
        },
      ],
    });

    const result = await processor.process(msg);
    expect(result.content).toContain('Failed to process voice');
    expect(result.content).toContain('API down');
  });
});

// ─── VoiceTranscriber ─────────────────────────────────────────

describe('VoiceTranscriber', () => {
  it('calls Groq Whisper API and returns text', async () => {
    // Create a real temp .wav file so readFile doesn't fail
    const wavFile = join(testDir, 'test.wav');
    writeFileSync(wavFile, Buffer.from('fake-wav-data'));

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('Hello world'),
    });
    const transcriber = new VoiceTranscriber('test-key');
    vi.spyOn(transcriber, 'convertToWav').mockResolvedValue(wavFile);

    const result = await transcriber.transcribe('/tmp/test.ogg');
    expect(result).toBe('Hello world');
    expect(fetch).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/audio/transcriptions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws on Groq API error', async () => {
    const wavFile = join(testDir, 'test.wav');
    writeFileSync(wavFile, Buffer.from('fake-wav'));

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Rate limited'),
    });
    const transcriber = new VoiceTranscriber('test-key');
    vi.spyOn(transcriber, 'convertToWav').mockResolvedValue(wavFile);

    await expect(transcriber.transcribe('/tmp/test.ogg')).rejects.toThrow('Groq Whisper 429');
  });
});

// ─── VisionAnalyzer ───────────────────────────────────────────

describe('VisionAnalyzer', () => {
  it('calls Groq Vision API and returns description', async () => {
    const imgFile = join(testDir, 'cat.jpg');
    writeFileSync(imgFile, Buffer.from('fake-jpeg-data'));

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'A cat photo' } }] }),
    });

    const analyzer = new VisionAnalyzer('test-key');
    const result = await analyzer.analyze(imgFile, 'image/jpeg');
    expect(result).toBe('A cat photo');
    expect(fetch).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('uses custom prompt when provided', async () => {
    const imgFile = join(testDir, 'screen.png');
    writeFileSync(imgFile, Buffer.from('fake-screenshot'));

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'Code on screen' } }] }),
    });

    const analyzer = new VisionAnalyzer('test-key');
    const result = await analyzer.analyze(imgFile, 'image/png', 'What code is this?');
    expect(result).toBe('Code on screen');

    // Verify custom prompt was sent
    const fetchCall = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(fetchCall[1]!.body as string);
    expect(body.messages[0].content[0].text).toBe('What code is this?');
  });

  it('throws on API error', async () => {
    const imgFile = join(testDir, 'img.png');
    writeFileSync(imgFile, Buffer.from('fake'));

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Server error'),
    });

    const analyzer = new VisionAnalyzer('test-key');
    await expect(analyzer.analyze(imgFile, 'image/png')).rejects.toThrow('Groq Vision 500');
  });
});

// ─── DocumentReader ───────────────────────────────────────────

describe('DocumentReader', () => {
  it('identifies text file extensions', () => {
    const reader = new DocumentReader();
    expect(reader.isTextFile('.ts')).toBe(true);
    expect(reader.isTextFile('.py')).toBe(true);
    expect(reader.isTextFile('.md')).toBe(true);
    expect(reader.isTextFile('.json')).toBe(true);
    expect(reader.isTextFile('.xyz')).toBe(false);
  });

  it('identifies document file extensions', () => {
    const reader = new DocumentReader();
    expect(reader.isDocumentFile('.pdf')).toBe(true);
    expect(reader.isDocumentFile('.txt')).toBe(false);
  });

  it('reads text files directly', async () => {
    const reader = new DocumentReader();
    const tsFile = join(testDir, 'index.ts');
    writeFileSync(tsFile, 'const x = 1;');

    const result = await reader.extract(tsFile, 'index.ts');
    expect(result).toBe('const x = 1;');
  });

  it('reads CSV files with row cap', async () => {
    const reader = new DocumentReader();
    const csvContent = Array.from({ length: 200 }, (_, i) => `row${i},val${i}`).join('\n');
    const csvFile = join(testDir, 'data.csv');
    writeFileSync(csvFile, csvContent);

    const result = await reader.extract(csvFile, 'data.csv');
    expect(result).toContain('[CSV Data');
    expect(result).toContain('100 rows');
  });

  it('returns unsupported message for unknown formats', async () => {
    const reader = new DocumentReader();
    const xyzFile = join(testDir, 'data.xyz');
    writeFileSync(xyzFile, 'unknown format');

    const result = await reader.extract(xyzFile, 'data.xyz');
    expect(result).toContain('Unsupported');
  });
});
