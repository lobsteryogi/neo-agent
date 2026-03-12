import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CliChannel, inferType } from '../../src/channels/cli';

describe('inferType', () => {
  it('returns audio for audio extensions', () => {
    expect(inferType('.ogg')).toBe('audio');
    expect(inferType('.mp3')).toBe('audio');
    expect(inferType('.wav')).toBe('audio');
    expect(inferType('.m4a')).toBe('audio');
    expect(inferType('.flac')).toBe('audio');
  });

  it('returns image for image extensions', () => {
    expect(inferType('.jpg')).toBe('image');
    expect(inferType('.jpeg')).toBe('image');
    expect(inferType('.png')).toBe('image');
    expect(inferType('.webp')).toBe('image');
    expect(inferType('.gif')).toBe('image');
    expect(inferType('.bmp')).toBe('image');
  });

  it('returns video for video extensions', () => {
    expect(inferType('.mp4')).toBe('video');
    expect(inferType('.mov')).toBe('video');
    expect(inferType('.avi')).toBe('video');
    expect(inferType('.mkv')).toBe('video');
  });

  it('returns document for unknown extensions', () => {
    expect(inferType('.pdf')).toBe('document');
    expect(inferType('.txt')).toBe('document');
    expect(inferType('.csv')).toBe('document');
    expect(inferType('')).toBe('document');
  });
});

describe('CliChannel', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'neo-cli-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('has name "cli"', () => {
    const ch = new CliChannel();
    expect(ch.name).toBe('cli');
  });

  it('toInbound creates correct message structure', () => {
    const ch = new CliChannel();
    const msg = ch.toInbound('hello world');
    expect(msg.channel).toBe('cli');
    expect(msg.channelId).toBe('cli');
    expect(msg.userId).toBe('local');
    expect(msg.content).toBe('hello world');
    expect(msg.sessionKey).toBe('cli:local');
    expect(msg.id).toBeTruthy();
    expect(msg.timestamp).toBeGreaterThan(0);
    expect(msg.attachments).toBeUndefined();
  });

  it('toInbound includes attachments when provided', () => {
    const ch = new CliChannel();
    const attachments = [
      {
        id: 'a1',
        type: 'image' as const,
        mimeType: 'image/png',
        fileName: 'test.png',
        fileSize: 100,
        localPath: '/tmp/test.png',
      },
    ];
    const msg = ch.toInbound('look at this', attachments);
    expect(msg.attachments).toHaveLength(1);
    expect(msg.attachments![0].type).toBe('image');
  });

  it('toInbound omits attachments when empty array', () => {
    const ch = new CliChannel();
    const msg = ch.toInbound('hello', []);
    expect(msg.attachments).toBeUndefined();
  });

  it('extractFileAttachments returns empty for non-matching commands', () => {
    const ch = new CliChannel();
    expect(ch.extractFileAttachments('hello world')).toEqual([]);
    expect(ch.extractFileAttachments('what is this?')).toEqual([]);
    expect(ch.extractFileAttachments('')).toEqual([]);
  });

  it('extractFileAttachments returns empty for non-existent file', () => {
    const ch = new CliChannel();
    expect(ch.extractFileAttachments('analyze /nonexistent/file.pdf')).toEqual([]);
  });

  it('extractFileAttachments detects real file with analyze', () => {
    const ch = new CliChannel();
    const filePath = join(tmpDir, 'test.pdf');
    writeFileSync(filePath, 'dummy content');
    const attachments = ch.extractFileAttachments(`analyze ${filePath}`);
    expect(attachments).toHaveLength(1);
    expect(attachments[0].type).toBe('document');
    expect(attachments[0].mimeType).toBe('application/pdf');
    expect(attachments[0].fileName).toBe('test.pdf');
    expect(attachments[0].fileSize).toBeGreaterThan(0);
    expect(attachments[0].localPath).toBe(filePath);
  });

  it('extractFileAttachments detects real image with describe', () => {
    const ch = new CliChannel();
    const filePath = join(tmpDir, 'photo.png');
    writeFileSync(filePath, 'dummy');
    const attachments = ch.extractFileAttachments(`describe ${filePath}`);
    expect(attachments).toHaveLength(1);
    expect(attachments[0].type).toBe('image');
    expect(attachments[0].mimeType).toBe('image/png');
  });

  it('extractFileAttachments detects audio with transcribe', () => {
    const ch = new CliChannel();
    const filePath = join(tmpDir, 'voice.mp3');
    writeFileSync(filePath, 'dummy');
    const attachments = ch.extractFileAttachments(`transcribe ${filePath}`);
    expect(attachments).toHaveLength(1);
    expect(attachments[0].type).toBe('audio');
  });

  it('each toInbound call generates a unique id', () => {
    const ch = new CliChannel();
    const ids = new Set(Array.from({ length: 20 }, () => ch.toInbound('x').id));
    expect(ids.size).toBe(20);
  });
});
