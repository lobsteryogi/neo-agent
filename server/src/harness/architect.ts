/**
 * ░▒▓ THE ARCHITECT ▓▒░
 *
 * "The first Matrix was designed to be a perfect human world."
 *
 * Validates that Claude's output is structurally valid:
 * non-empty, valid encoding, no binary garbage.
 */

export interface HarnessWrapper {
  name: string;
  process(response: any, session?: any): Promise<any>;
}

export class Architect implements HarnessWrapper {
  readonly name = 'Architect';

  async process(response: any): Promise<any> {
    if (!response) {
      throw new Error('Architect: empty response from Claude');
    }

    // Extract content text
    const content = this.extractContent(response);

    if (!content || content.trim().length === 0) {
      throw new Error('Architect: response contains no text content');
    }

    // Check for binary garbage (non-printable chars beyond normal whitespace)
    const binaryRatio = this.binaryCharRatio(content);
    if (binaryRatio > 0.1) {
      throw new Error(
        `Architect: response contains too many non-printable characters (${(binaryRatio * 100).toFixed(1)}%)`,
      );
    }

    return { ...response, validatedContent: content };
  }

  private extractContent(response: any): string {
    if (typeof response === 'string') return response;
    if (response.data?.content) return String(response.data.content);
    if (response.data?.result) return String(response.data.result);
    if (response.content) return String(response.content);
    if (response.validatedContent) return response.validatedContent;
    return JSON.stringify(response);
  }

  private binaryCharRatio(content: string): number {
    let binaryChars = 0;
    for (const char of content) {
      const code = char.charCodeAt(0);
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
        binaryChars++;
      }
    }
    return binaryChars / content.length;
  }
}
