/**
 * ░▒▓ GEO-SEO ROUTES ▓▒░
 *
 * "The Matrix is everywhere." — Agent Smith
 *
 * API endpoints for GEO-SEO skill execution.
 * Runs Python scripts from /root/.claude/skills/geo/scripts/
 */

import { spawn } from 'child_process';
import type { Express } from 'express';
import { wrapRoute } from './route-handler.js';

const SCRIPTS_DIR = '/root/.claude/skills/geo/scripts';

type GeoCommand =
  | 'citability'
  | 'crawlers'
  | 'brands'
  | 'fetch'
  | 'llmstxt'
  | 'technical'
  | 'schema';

const SCRIPT_MAP: Record<GeoCommand, string> = {
  citability: 'citability_scorer.py',
  crawlers: 'fetch_page.py',
  brands: 'brand_scanner.py',
  fetch: 'fetch_page.py',
  llmstxt: 'llmstxt_generator.py',
  technical: 'fetch_page.py',
  schema: 'fetch_page.py',
};

const MAX_BUFFER = 2 * 1024 * 1024; // 2 MB
const TIMEOUT_MS = 60_000; // 60 seconds

function runPythonScript(script: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [`${SCRIPTS_DIR}/${script}`, ...args]);
    let stdout = '';
    let stderr = '';
    let totalBytes = 0;

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Script timed out after ${TIMEOUT_MS / 1000}s`));
    }, TIMEOUT_MS);

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.stdout.on('data', (data: Buffer) => {
      totalBytes += data.length;
      if (totalBytes > MAX_BUFFER) {
        proc.kill();
        clearTimeout(timer);
        reject(new Error('Script output exceeded 2 MB limit'));
        return;
      }
      stdout += data.toString();
    });
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr || `Process exited with code ${code}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

export function registerGeoRoutes(app: Express): void {
  // POST /api/geo/run — run a geo command
  app.post(
    '/api/geo/run',
    wrapRoute(async (req, res) => {
      const { command, url } = req.body as { command: GeoCommand; url: string };

      if (!command || !url) {
        res.status(400).json({ error: 'command and url are required' });
        return;
      }

      if (!SCRIPT_MAP[command]) {
        res.status(400).json({ error: `Unknown command: ${command}` });
        return;
      }

      const script = SCRIPT_MAP[command];
      const output = await runPythonScript(script, [url]);

      // Try to parse JSON output, fallback to raw text
      try {
        const parsed = JSON.parse(output);
        res.json({ command, url, result: parsed });
      } catch {
        res.json({ command, url, result: output });
      }
    }),
  );

  // GET /api/geo/commands — list available commands
  app.get(
    '/api/geo/commands',
    wrapRoute((_req, res) => {
      res.json({
        commands: [
          {
            id: 'citability',
            label: 'Citability Score',
            description: 'AI citation readiness score',
          },
          {
            id: 'crawlers',
            label: 'AI Crawlers',
            description: 'Check robots.txt for 14+ AI crawlers',
          },
          {
            id: 'brands',
            label: 'Brand Mentions',
            description: 'Scan YouTube, Reddit, Wikipedia, LinkedIn',
          },
          { id: 'llmstxt', label: 'LLMs.txt', description: 'Analyze/generate llms.txt file' },
          { id: 'fetch', label: 'Page Fetch', description: 'Fetch and parse page metadata' },
          { id: 'technical', label: 'Technical SEO', description: 'Technical SEO audit' },
          { id: 'schema', label: 'Schema / JSON-LD', description: 'Structured data analysis' },
        ],
      });
    }),
  );
}
