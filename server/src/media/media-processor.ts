/**
 * ░▒▓ MEDIA PROCESSOR ▓▒░
 *
 * "I see everything. I hear everything."
 *
 * Central orchestrator for all media types.
 * Runs as step 0 in the agent pipeline — before guardrails.
 *
 * Voice → transcription via Groq Whisper
 * Image → analysis via Groq Vision (Llama 3.2 90B)
 * Document → text extraction via pdf-parse / direct read
 */

import type { InboundMessage } from '@neo-agent/shared';
import { logger } from '../utils/logger.js';
import { DocumentReader } from './document-reader.js';
import { VisionAnalyzer } from './vision-analyzer.js';
import { VoiceTranscriber } from './voice-transcriber.js';

export interface MediaConfig {
  groqApiKey: string;
  maxVoiceDurationSeconds: number; // Default: 300 (5 min)
  maxImageSizeMb: number; // Default: 10
  maxDocumentSizeMb: number; // Default: 25
  tempDir: string; // Default: /tmp/neo-media
  cleanupAfterMinutes: number; // Default: 30
}

const log = logger('media');

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

    const enriched = { ...message, attachments: [...message.attachments] };
    const contentParts: string[] = message.content ? [message.content] : [];

    for (const attachment of enriched.attachments) {
      try {
        switch (attachment.type) {
          case 'voice':
          case 'audio': {
            // Size guard
            if (attachment.duration && attachment.duration > this.config.maxVoiceDurationSeconds) {
              contentParts.push(
                `[Voice message too long: ${attachment.duration}s, max ${this.config.maxVoiceDurationSeconds}s]`,
              );
              break;
            }
            const transcription = await this.voiceTranscriber.transcribe(attachment.localPath!);
            attachment.transcription = transcription;
            contentParts.push(`[Voice message]: ${transcription}`);
            break;
          }
          case 'image': {
            // Size guard
            const sizeMb = attachment.fileSize / (1024 * 1024);
            if (sizeMb > this.config.maxImageSizeMb) {
              contentParts.push(
                `[Image too large: ${sizeMb.toFixed(1)}MB, max ${this.config.maxImageSizeMb}MB]`,
              );
              break;
            }
            const analysis = await this.visionAnalyzer.analyze(
              attachment.localPath!,
              attachment.mimeType,
            );
            attachment.analysis = analysis;
            contentParts.push(`[Image: ${attachment.fileName ?? 'photo'}]: ${analysis}`);
            break;
          }
          case 'document': {
            // Size guard
            const docSizeMb = attachment.fileSize / (1024 * 1024);
            if (docSizeMb > this.config.maxDocumentSizeMb) {
              contentParts.push(
                `[Document too large: ${docSizeMb.toFixed(1)}MB, max ${this.config.maxDocumentSizeMb}MB]`,
              );
              break;
            }
            const text = await this.documentReader.extract(
              attachment.localPath!,
              attachment.fileName,
            );
            attachment.analysis = text;
            contentParts.push(`[Document: ${attachment.fileName}]:\n${text}`);
            break;
          }
          case 'video': {
            contentParts.push(
              `[Video: ${attachment.fileName ?? 'video'}] (video analysis not yet supported)`,
            );
            break;
          }
        }
      } catch (err) {
        log.warn(`Media processing failed for ${attachment.type}`, { error: String(err) });
        contentParts.push(
          `[Failed to process ${attachment.type}: ${err instanceof Error ? err.message : String(err)}]`,
        );
      }
    }

    enriched.content = contentParts.filter(Boolean).join('\n\n');
    return enriched;
  }
}
