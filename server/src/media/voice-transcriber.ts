/**
 * ░▒▓ VOICE TRANSCRIBER ▓▒░
 *
 * "I hear you, even through the static."
 *
 * Groq Whisper API — free tier: 20 req/min, whisper-large-v3-turbo, ~2s latency.
 * Converts OGG/Opus to WAV via ffmpeg before transcription.
 */

import { readFile } from 'fs/promises';

export class VoiceTranscriber {
  constructor(private apiKey: string) {}

  async transcribe(localPath: string): Promise<string> {
    // Convert to WAV if needed (Telegram sends OGG/Opus)
    const wavPath = await this.convertToWav(localPath);

    const fileBuffer = await readFile(wavPath);
    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer]), 'audio.wav');
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

  async convertToWav(inputPath: string): Promise<string> {
    if (inputPath.endsWith('.wav')) return inputPath;

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const outputPath = inputPath.replace(/\.[^.]+$/, '.wav');
    await execAsync(`ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -f wav "${outputPath}" -y`);
    return outputPath;
  }
}
