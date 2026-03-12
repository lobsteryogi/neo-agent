import { describe, expect, it } from 'vitest';
import { WebChannel } from '../../src/channels/web';

describe('WebChannel', () => {
  it('has name "web"', () => {
    // WebSocketServer binds to a port — use a port unlikely to conflict
    const ch = new WebChannel({ port: 0, token: 'test-token' });
    expect(ch.name).toBe('web');
    ch.stop(); // clean up
  });

  it('toInbound builds correct message structure', () => {
    const ch = new WebChannel({ port: 0, token: 'tok' });
    const msg = ch.toInbound('hello', 'user-abc');
    expect(msg.channel).toBe('web');
    expect(msg.channelId).toBe('web');
    expect(msg.userId).toBe('user-abc');
    expect(msg.content).toBe('hello');
    expect(msg.sessionKey).toBe('web:user-abc');
    expect(msg.id).toBeTruthy();
    expect(msg.timestamp).toBeGreaterThan(0);
    expect(msg.attachments).toBeUndefined();
    ch.stop();
  });

  it('toInbound includes attachments when provided', () => {
    const ch = new WebChannel({ port: 0, token: 'tok' });
    const attachments = [
      {
        id: 'a1',
        type: 'image' as const,
        mimeType: 'image/png',
        fileName: 'img.png',
        fileSize: 200,
        localPath: '/tmp/img.png',
      },
    ];
    const msg = ch.toInbound('see this', 'u1', attachments);
    expect(msg.attachments).toHaveLength(1);
    ch.stop();
  });

  it('toInbound omits attachments for empty array', () => {
    const ch = new WebChannel({ port: 0, token: 'tok' });
    const msg = ch.toInbound('hi', 'u1', []);
    expect(msg.attachments).toBeUndefined();
    ch.stop();
  });

  it('processUploads decodes base64 and writes files', async () => {
    const ch = new WebChannel({ port: 0, token: 'tok' });
    const content = 'hello world';
    const b64 = Buffer.from(content).toString('base64');
    const result = await ch.processUploads([
      { data: b64, fileName: 'test.txt', mimeType: 'text/plain' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].fileName).toBe('test.txt');
    expect(result[0].mimeType).toBe('text/plain');
    expect(result[0].fileSize).toBe(Buffer.from(content).length);
    expect(result[0].type).toBe('document');
    ch.stop();
  });

  it('processUploads infers image type from extension', async () => {
    const ch = new WebChannel({ port: 0, token: 'tok' });
    const b64 = Buffer.from('fake png').toString('base64');
    const [att] = await ch.processUploads([
      { data: b64, fileName: 'photo.png', mimeType: 'image/png' },
    ]);
    expect(att.type).toBe('image');
    ch.stop();
  });

  it('processUploads handles multiple files', async () => {
    const ch = new WebChannel({ port: 0, token: 'tok' });
    const b64 = Buffer.from('x').toString('base64');
    const result = await ch.processUploads([
      { data: b64, fileName: 'a.txt', mimeType: 'text/plain' },
      { data: b64, fileName: 'b.mp3', mimeType: 'audio/mpeg' },
    ]);
    expect(result).toHaveLength(2);
    expect(result[1].type).toBe('audio');
    ch.stop();
  });

  it('unique ids across multiple toInbound calls', () => {
    const ch = new WebChannel({ port: 0, token: 'tok' });
    const ids = new Set(Array.from({ length: 10 }, () => ch.toInbound('msg', 'u').id));
    expect(ids.size).toBe(10);
    ch.stop();
  });
});
