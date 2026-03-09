import type { Attachment } from '@neo-agent/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CliChannel, inferType } from '../../src/channels/cli';
import { TelegramChannel } from '../../src/channels/telegram';
import { WebChannel } from '../../src/channels/web';

// ─── CLI Channel ──────────────────────────────────────────────

describe('CliChannel', () => {
  it('toInbound() creates valid InboundMessage with sessionKey cli:local', () => {
    const cli = new CliChannel();
    const msg = cli.toInbound('Hello');
    expect(msg.sessionKey).toBe('cli:local');
    expect(msg.channel).toBe('cli');
    expect(msg.userId).toBe('local');
    expect(msg.content).toBe('Hello');
    expect(typeof msg.id).toBe('string');
    expect(msg.id.length).toBeGreaterThan(0);
  });

  it('each message gets a unique id', () => {
    const cli = new CliChannel();
    const msg1 = cli.toInbound('a');
    const msg2 = cli.toInbound('b');
    expect(msg1.id).not.toBe(msg2.id);
  });

  it('timestamp is set to current time', () => {
    const cli = new CliChannel();
    const before = Date.now();
    const msg = cli.toInbound('test');
    const after = Date.now();
    expect(msg.timestamp).toBeGreaterThanOrEqual(before);
    expect(msg.timestamp).toBeLessThanOrEqual(after);
  });

  it('extractFileAttachments() returns attachment for valid file path', () => {
    const cli = new CliChannel();
    // Use this test file itself as a valid path
    const attachments = cli.extractFileAttachments(`analyze ${__filename}`);
    expect(attachments).toHaveLength(1);
    expect(attachments[0].type).toBe('document');
    expect(attachments[0].fileName).toContain('channel-adapter.test');
  });

  it('extractFileAttachments() returns empty for non-existent path', () => {
    const cli = new CliChannel();
    const attachments = cli.extractFileAttachments('analyze /tmp/nonexistent-file-abc123.pdf');
    expect(attachments).toHaveLength(0);
  });

  it('extractFileAttachments() returns empty for non-matching command', () => {
    const cli = new CliChannel();
    const attachments = cli.extractFileAttachments('hello world');
    expect(attachments).toHaveLength(0);
  });

  it('toInbound() includes attachments when provided', () => {
    const cli = new CliChannel();
    const attachment: Attachment = {
      id: 'att-1',
      type: 'image',
      mimeType: 'image/jpeg',
      fileSize: 1024,
      localPath: '/tmp/test.jpg',
    };
    const msg = cli.toInbound('Look at this', [attachment]);
    expect(msg.attachments).toHaveLength(1);
    expect(msg.attachments![0].type).toBe('image');
  });

  it('toInbound() omits attachments when empty', () => {
    const cli = new CliChannel();
    const msg = cli.toInbound('Hello', []);
    expect(msg.attachments).toBeUndefined();
  });
});

describe('inferType()', () => {
  it('maps audio extensions correctly', () => {
    expect(inferType('.ogg')).toBe('audio');
    expect(inferType('.mp3')).toBe('audio');
    expect(inferType('.wav')).toBe('audio');
    expect(inferType('.m4a')).toBe('audio');
  });

  it('maps image extensions correctly', () => {
    expect(inferType('.jpg')).toBe('image');
    expect(inferType('.jpeg')).toBe('image');
    expect(inferType('.png')).toBe('image');
    expect(inferType('.webp')).toBe('image');
  });

  it('maps video extensions correctly', () => {
    expect(inferType('.mp4')).toBe('video');
    expect(inferType('.mov')).toBe('video');
  });

  it('defaults to document for unknown extensions', () => {
    expect(inferType('.pdf')).toBe('document');
    expect(inferType('.docx')).toBe('document');
    expect(inferType('.xyz')).toBe('document');
  });
});

// ─── Web Channel ──────────────────────────────────────────────

describe('WebChannel', () => {
  it('toInbound() derives sessionKey as web:userId', () => {
    const web = new WebChannel({ port: 0, token: 'test' });
    const msg = web.toInbound('Hello', 'user-123');
    expect(msg.sessionKey).toBe('web:user-123');
    expect(msg.channel).toBe('web');
    expect(msg.channelId).toBe('web');
  });

  it('each message gets a unique id', () => {
    const web = new WebChannel({ port: 0, token: 'test' });
    const msg1 = web.toInbound('a', 'user-1');
    const msg2 = web.toInbound('b', 'user-1');
    expect(msg1.id).not.toBe(msg2.id);
  });

  it('toInbound() preserves content', () => {
    const web = new WebChannel({ port: 0, token: 'test' });
    const msg = web.toInbound('test message', 'user-1');
    expect(msg.content).toBe('test message');
  });

  it('processUploads() creates valid attachments from base64 data', async () => {
    const web = new WebChannel({ port: 0, token: 'test' });
    const raw = [
      {
        data: Buffer.from('test content').toString('base64'),
        fileName: 'test.txt',
        mimeType: 'text/plain',
      },
    ];
    const attachments = await web.processUploads(raw);
    expect(attachments).toHaveLength(1);
    expect(attachments[0].type).toBe('document');
    expect(attachments[0].fileName).toBe('test.txt');
    expect(attachments[0].fileSize).toBe(12); // 'test content'.length
  });
});

// ─── Telegram Channel ─────────────────────────────────────────

describe('TelegramChannel', () => {
  it('toInbound() derives sessionKey as telegram:chatId', () => {
    const tg = new TelegramChannel('fake-token');
    const ctx = {
      message: {
        message_id: 42,
        chat: { id: 123456 },
        from: { id: 789 },
        text: 'Hello',
        date: 1700000000,
      },
    };
    const msg = tg.toInbound(ctx);
    expect(msg.sessionKey).toBe('telegram:123456');
    expect(msg.channel).toBe('telegram');
    expect(msg.userId).toBe('789');
    expect(msg.content).toBe('Hello');
    expect(msg.timestamp).toBe(1700000000000); // date * 1000
  });

  it('toInbound() uses caption when text is undefined', () => {
    const tg = new TelegramChannel('fake-token');
    const ctx = {
      message: {
        message_id: 43,
        chat: { id: 123456 },
        from: { id: 789 },
        caption: 'Photo caption',
        date: 1700000000,
      },
    };
    const msg = tg.toInbound(ctx);
    expect(msg.content).toBe('Photo caption');
  });

  it('toInbound() includes attachments when provided', () => {
    const tg = new TelegramChannel('fake-token');
    const ctx = {
      message: {
        message_id: 44,
        chat: { id: 123456 },
        from: { id: 789 },
        text: 'Look',
        date: 1700000000,
      },
    };
    const attachment: Attachment = {
      id: 'photo-1',
      type: 'image',
      mimeType: 'image/jpeg',
      fileSize: 2048,
      localPath: '/tmp/photo.jpg',
    };
    const msg = tg.toInbound(ctx, [attachment]);
    expect(msg.attachments).toHaveLength(1);
    expect(msg.attachments![0].type).toBe('image');
  });

  it('/help command returns true', async () => {
    const tg = new TelegramChannel('fake-token');
    const ctx = { reply: vi.fn().mockResolvedValue(undefined) };
    const handled = await tg.handleCommand('/help', ctx);
    expect(handled).toBe(true);
    expect(ctx.reply).toHaveBeenCalledOnce();
    expect(ctx.reply.mock.calls[0][0]).toContain('/help');
  });

  it('/start command returns true', async () => {
    const tg = new TelegramChannel('fake-token');
    const ctx = { reply: vi.fn().mockResolvedValue(undefined) };
    const handled = await tg.handleCommand('/start', ctx);
    expect(handled).toBe(true);
    expect(ctx.reply).toHaveBeenCalledOnce();
    expect(ctx.reply.mock.calls[0][0]).toContain('Welcome');
  });

  it('unknown command returns false', async () => {
    const tg = new TelegramChannel('fake-token');
    const ctx = { reply: vi.fn() };
    const handled = await tg.handleCommand('/notacommand', ctx);
    expect(handled).toBe(false);
    expect(ctx.reply).not.toHaveBeenCalled();
  });
});
