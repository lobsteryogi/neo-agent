/**
 * ░▒▓ GEO-SEO PAGE ▓▒░
 * AI Search Optimization Dashboard
 */

import { useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { cn } from '../lib/utils';

const COMMANDS = [
  { id: 'citability', label: 'Citability', description: 'AI citation readiness score' },
  { id: 'crawlers', label: 'AI Crawlers', description: 'Check robots.txt for AI crawlers' },
  { id: 'brands', label: 'Brand Mentions', description: 'Scan YouTube, Reddit, Wikipedia' },
  { id: 'llmstxt', label: 'LLMs.txt', description: 'Analyze / generate llms.txt' },
  { id: 'fetch', label: 'Page Fetch', description: 'Fetch & parse page metadata' },
  { id: 'technical', label: 'Technical SEO', description: 'Technical SEO audit' },
  { id: 'schema', label: 'Schema / JSON-LD', description: 'Structured data analysis' },
];

export default function GeoPage() {
  const [url, setUrl] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function run() {
    if (!url || !selected) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch('/api/geo/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: selected, url }),
        signal: ctrl.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unknown error');
      setResult(
        typeof data.result === 'string' ? data.result : JSON.stringify(data.result, null, 2),
      );
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 p-6 gap-6 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-[0.2em] uppercase text-primary">GEO-SEO</h1>
        <p className="text-muted-foreground text-sm mt-1">
          AI Search Optimization — optimize for ChatGPT, Claude, Perplexity &amp; more
        </p>
      </div>

      {/* URL Input */}
      <div className="flex gap-2">
        <Input
          type="url"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          className="flex-1"
        />
        <Button
          onClick={run}
          disabled={!url || !selected || loading}
          variant="default"
          size="sm"
          className="tracking-wider"
        >
          {loading ? 'RUNNING...' : 'RUN'}
        </Button>
      </div>

      {/* Command Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {COMMANDS.map((cmd) => (
          <button
            key={cmd.id}
            onClick={() => setSelected(cmd.id)}
            className={cn(
              'text-left p-3 rounded-md border transition-all text-xs',
              selected === cmd.id
                ? 'border-primary/60 bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground',
            )}
          >
            <div className="font-semibold tracking-wide mb-0.5">{cmd.label}</div>
            <div className="opacity-60 leading-snug">{cmd.description}</div>
          </button>
        ))}
      </div>

      {/* Result */}
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive text-sm p-4">
          {error}
        </div>
      )}
      {result && (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-muted-foreground tracking-wider uppercase">Result</div>
          <pre className="bg-card border border-border rounded-md p-4 text-xs text-foreground overflow-auto whitespace-pre-wrap max-h-[500px]">
            {result}
          </pre>
        </div>
      )}
    </div>
  );
}
