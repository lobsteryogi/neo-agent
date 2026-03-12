/**
 * ░▒▓ CRON PAGE ▓▒░
 * AI-powered scheduled job creation
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, Play, Send, Trash2, X } from 'lucide-react';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';

// ─── Types ─────────────────────────────────────────────────────

interface CronJob {
  name: string;
  expression: string;
  command: string;
  description?: string;
  createdAt: number;
  lastRunAt?: number;
  runCount: number;
}

interface GeneratedDraft {
  name: string;
  expression: string;
  command: string;
  description?: string;
}

// ─── Example prompts ──────────────────────────────────────────

const EXAMPLES = [
  'Ping the health endpoint every 5 minutes',
  'Back up the database every night at 2am',
  'Clean temp files daily at 3am',
  'Check disk usage every hour and log it',
  'Restart the server every Sunday at 4am',
  'Send a weekly report every Monday at 9am',
];

// ─── Helpers ──────────────────────────────────────────────────

function fmtTime(ms?: number): string {
  if (!ms) return 'never';
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtAge(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ─── Editable field ───────────────────────────────────────────

function EditableField({
  label,
  value,
  onChange,
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground tracking-widest uppercase">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'bg-transparent border-b border-border/50 focus:border-primary/60 outline-none',
          'text-sm text-foreground py-0.5 transition-colors',
          mono && 'font-mono',
        )}
      />
    </div>
  );
}

// ─── Draft Preview Card ───────────────────────────────────────

interface DraftCardProps {
  draft: GeneratedDraft;
  onUpdate: (d: GeneratedDraft) => void;
  onSchedule: () => void;
  onDiscard: () => void;
  scheduling: boolean;
  error: string | null;
}

function DraftCard({ draft, onUpdate, onSchedule, onDiscard, scheduling, error }: DraftCardProps) {
  return (
    <div className="border border-primary/40 bg-primary/5 rounded-lg p-5 flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold text-primary tracking-widest uppercase">
          Generated — review & schedule
        </span>
      </div>

      {/* Description */}
      {draft.description && (
        <p className="text-sm text-muted-foreground leading-relaxed">{draft.description}</p>
      )}

      {/* Editable fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <EditableField
          label="Name"
          value={draft.name}
          onChange={(v) => onUpdate({ ...draft, name: v })}
          mono
        />
        <EditableField
          label="Schedule (cron)"
          value={draft.expression}
          onChange={(v) => onUpdate({ ...draft, expression: v })}
          mono
        />
        <div className="sm:col-span-2">
          <EditableField
            label="Command"
            value={draft.command}
            onChange={(v) => onUpdate({ ...draft, command: v })}
            mono
          />
        </div>
      </div>

      {error && (
        <div className="text-xs text-destructive border border-destructive/40 bg-destructive/10 rounded p-2">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 justify-end pt-1">
        <Button variant="ghost" size="sm" onClick={onDiscard} disabled={scheduling}>
          Discard
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onSchedule}
          disabled={scheduling || !draft.name || !draft.expression || !draft.command}
        >
          {scheduling ? 'Scheduling...' : 'Schedule It'}
        </Button>
      </div>
    </div>
  );
}

// ─── Cron Job Row ─────────────────────────────────────────────

interface CronRowProps {
  job: CronJob;
  onDelete: (name: string) => void;
  onTrigger: (name: string) => void;
}

function CronRow({ job, onDelete }: CronRowProps) {
  const [triggering, setTriggering] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [flash, setFlash] = useState(false);

  async function handleTrigger() {
    setTriggering(true);
    try {
      await fetch(`/api/crons/${encodeURIComponent(job.name)}/trigger`, { method: 'POST' });
      setFlash(true);
      setTimeout(() => setFlash(false), 1500);
    } finally {
      setTriggering(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/crons/${encodeURIComponent(job.name)}`, { method: 'DELETE' });
      onDelete(job.name);
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div
      className={cn(
        'group bg-card border border-border rounded-lg px-4 py-3 flex items-center gap-4 transition-colors',
        flash && 'border-primary/50 bg-primary/5',
      )}
    >
      {/* Icon */}
      <Clock
        className={cn(
          'h-4 w-4 flex-shrink-0 transition-colors',
          flash ? 'text-primary' : 'text-muted-foreground/40',
        )}
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium text-foreground truncate">{job.name}</span>
          <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex-shrink-0">
            {job.expression}
          </span>
        </div>
        {job.description && (
          <p className="text-xs text-muted-foreground truncate mb-0.5">{job.description}</p>
        )}
        <code className="text-xs text-muted-foreground/60 font-mono truncate block">
          {job.command}
        </code>
      </div>

      {/* Stats */}
      <div className="hidden sm:flex flex-col items-end gap-0.5 flex-shrink-0 text-xs text-muted-foreground">
        <span>
          <span className="text-foreground font-medium">{job.runCount}</span> runs
        </span>
        <span>last {fmtTime(job.lastRunAt)}</span>
        <span className="text-muted-foreground/50">{fmtAge(job.createdAt)}</span>
      </div>

      {/* Actions */}
      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <Button
          variant="outline"
          size="icon"
          onClick={handleTrigger}
          disabled={triggering}
          title="Run now"
        >
          <Play className={cn('h-3 w-3', triggering && 'animate-pulse')} />
        </Button>
        <Button
          variant="destructive"
          size="icon"
          onClick={handleDelete}
          disabled={deleting}
          title="Delete"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────

export default function CronPage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);

  // AI generation state
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [draft, setDraft] = useState<GeneratedDraft | null>(null);

  // Schedule state
  const [scheduling, setScheduling] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ─── Load jobs ──────────────────────────────────────────────
  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/crons');
      if (res.ok) setJobs(await res.json());
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // ─── Generate ───────────────────────────────────────────────
  async function generate() {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setGenError(null);
    setDraft(null);

    try {
      const res = await fetch('/api/crons/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setDraft(data);
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  // ─── Schedule draft ─────────────────────────────────────────
  async function scheduleDraft() {
    if (!draft) return;
    setScheduling(true);
    setScheduleError(null);

    try {
      const res = await fetch('/api/crons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to schedule');
      setJobs((prev) => [...prev, data]);
      setDraft(null);
      setPrompt('');
    } catch (e: unknown) {
      setScheduleError(e instanceof Error ? e.message : String(e));
    } finally {
      setScheduling(false);
    }
  }

  function useExample(ex: string) {
    setPrompt(ex);
    setDraft(null);
    setGenError(null);
    textareaRef.current?.focus();
  }

  return (
    <div className="flex flex-col flex-1 p-6 gap-8 max-w-3xl mx-auto w-full">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-[0.2em] uppercase text-primary">CRON</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Describe what you want scheduled — Claude handles the rest.
        </p>
      </div>

      {/* Prompt input */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <textarea
            ref={textareaRef}
            rows={3}
            placeholder="e.g. Back up the database every night at 2am…"
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              setGenError(null);
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') generate();
            }}
            className={cn(
              'w-full resize-none rounded-lg border bg-card text-sm text-foreground placeholder:text-muted-foreground/50',
              'px-4 py-3 pr-12 outline-none transition-colors',
              'focus:border-primary/60 border-border',
            )}
          />
          <button
            onClick={generate}
            disabled={!prompt.trim() || generating}
            className={cn(
              'absolute right-3 bottom-3 p-1.5 rounded-md transition-colors',
              prompt.trim() && !generating
                ? 'text-primary hover:bg-primary/10'
                : 'text-muted-foreground/30',
            )}
            title="Generate (⌘↵)"
          >
            <Send className={cn('h-4 w-4', generating && 'animate-pulse')} />
          </button>
        </div>

        {/* Example chips */}
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => useExample(ex)}
              className="text-xs px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>

        {/* Generating indicator */}
        {generating && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Asking Claude...
          </div>
        )}

        {/* Generation error */}
        {genError && (
          <div className="flex items-start gap-2 text-xs text-destructive border border-destructive/40 bg-destructive/10 rounded-md p-3">
            <span className="flex-1">{genError}</span>
            <button onClick={() => setGenError(null)}>
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* AI Draft preview */}
      {draft && (
        <DraftCard
          draft={draft}
          onUpdate={setDraft}
          onSchedule={scheduleDraft}
          onDiscard={() => setDraft(null)}
          scheduling={scheduling}
          error={scheduleError}
        />
      )}

      {/* Scheduled jobs */}
      {!loadingJobs && jobs.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-muted-foreground tracking-wider uppercase">
            {jobs.length} scheduled
          </div>
          {jobs.map((job) => (
            <CronRow
              key={job.name}
              job={job}
              onDelete={(name) => setJobs((prev) => prev.filter((j) => j.name !== name))}
              onTrigger={() => {}}
            />
          ))}
        </div>
      )}

      {!loadingJobs && jobs.length === 0 && !draft && (
        <p className="text-xs text-muted-foreground/40 text-center pt-4">
          No jobs scheduled yet. Describe one above.
        </p>
      )}
    </div>
  );
}
