/**
 * ░▒▓ VISION ANALYZER ▓▒░
 *
 * "I can see it... the code is everywhere."
 *
 * Groq Vision API (Llama 3.2 90B Vision) for image understanding.
 * Free tier — extracts text, code, diagrams, and data from images.
 */

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
    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0].message.content;
  }
}
