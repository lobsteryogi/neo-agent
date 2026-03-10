/**
 * ░▒▓ DOCUMENT READER ▓▒░
 *
 * "The answers are in the code."
 *
 * Reads text files directly, PDFs via pdf-parse, CSV/TSV with row cap.
 * No external API keys required.
 */

import { readFile } from 'fs/promises';
import { getErrorMessage } from '../utils/errors.js';
import path from 'path';

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.md',
  '.txt',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.xml',
  '.html',
  '.css',
  '.scss',
  '.less',
  '.sql',
  '.sh',
  '.bash',
  '.zsh',
  '.env',
  '.env.example',
  '.gitignore',
  '.dockerfile',
  '.swift',
  '.kt',
  '.dart',
  '.php',
  '.r',
  '.lua',
  '.zig',
]);

const DOCUMENT_EXTENSIONS = new Set(['.pdf']);

export class DocumentReader {
  async extract(localPath: string, fileName?: string): Promise<string> {
    const ext = path.extname(fileName ?? localPath).toLowerCase();

    // Code & text files — direct read
    if (TEXT_EXTENSIONS.has(ext)) {
      return readFile(localPath, 'utf-8');
    }

    // PDF — pdf-parse (lightweight, no external API)
    if (DOCUMENT_EXTENSIONS.has(ext)) {
      try {
        const pdfParse = (await import('pdf-parse')).default;
        const buffer = await readFile(localPath);
        const data = await pdfParse(buffer);
        return data.text;
      } catch (err) {
        return `[PDF parse error: ${getErrorMessage(err)}]`;
      }
    }

    // CSV/TSV — direct read with 100-row cap
    if (['.csv', '.tsv'].includes(ext)) {
      const content = await readFile(localPath, 'utf-8');
      const lines = content.split('\n').slice(0, 100);
      return `[CSV Data — ${lines.length} rows]:\n${lines.join('\n')}`;
    }

    return `[Unsupported file type: ${ext}]`;
  }

  isTextFile(ext: string): boolean {
    return TEXT_EXTENSIONS.has(ext);
  }

  isDocumentFile(ext: string): boolean {
    return DOCUMENT_EXTENSIONS.has(ext);
  }
}
