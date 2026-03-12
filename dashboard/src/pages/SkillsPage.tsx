/**
 * ░▒▓ SKILLS PAGE ▓▒░
 * Browse, inspect, and create workspace skills
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Link,
  Plus,
  Search,
  Send,
  Trash2,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { cn } from '../lib/utils';

// ─── Types ─────────────────────────────────────────────────────

interface SkillSummary {
  name: string;
  description: string;
  tags: string[];
  source?: 'local' | 'global';
}

interface SkillDetail extends SkillSummary {
  instructions: string;
  path: string;
  scripts: string[];
  examples: string[];
}

interface SkillDraft {
  name: string;
  description: string;
  tags: string[];
  instructions: string;
  rawContent: string;
}

// ─── Tag badge ────────────────────────────────────────────────

function Tag({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'text-[10px] px-2 py-0.5 rounded-full border transition-colors',
        active
          ? 'border-primary/60 bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:border-primary/30 hover:text-foreground',
        !onClick && 'cursor-default pointer-events-none',
      )}
    >
      {label}
    </button>
  );
}

// ─── Add Skill Panel ──────────────────────────────────────────

interface AddSkillPanelProps {
  onSaved: (skill: SkillSummary) => void;
  onClose: () => void;
}

function AddSkillPanel({ onSaved, onClose }: AddSkillPanelProps) {
  const [mode, setMode] = useState<'prompt' | 'url'>('prompt');
  const [destination, setDestination] = useState<'local' | 'global'>('local');
  const [prompt, setPrompt] = useState('');
  const [url, setUrl] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [draft, setDraft] = useState<SkillDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const input = mode === 'prompt' ? prompt : url;
  const hasInput = input.trim().length > 0;

  async function generate() {
    if (!hasInput || generating) return;
    setGenerating(true);
    setGenError(null);
    setDraft(null);

    try {
      const body =
        mode === 'prompt'
          ? { prompt: prompt.trim() }
          : { url: url.trim(), prompt: prompt.trim() || undefined };

      const res = await fetch('/api/skills/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

  async function save() {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);

    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draft.name, rawContent: draft.rawContent, destination }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      onSaved({ name: data.name, description: data.description, tags: data.tags });
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-primary/30 bg-primary/5 rounded-lg p-5 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Panel header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-primary tracking-widest uppercase">
            Add Skill
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Mode + destination toggles */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Source mode */}
        <div className="flex gap-1 bg-muted/40 rounded-md p-0.5">
          {(['prompt', 'url'] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setGenError(null);
                setDraft(null);
              }}
              className={cn(
                'flex items-center gap-1.5 text-xs px-3 py-1 rounded transition-colors',
                mode === m
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m === 'prompt' ? <Wand2 className="h-3 w-3" /> : <Link className="h-3 w-3" />}
              {m === 'prompt' ? 'From Prompt' : 'From URL'}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Destination */}
        <div className="flex gap-1 bg-muted/40 rounded-md p-0.5">
          {(['local', 'global'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDestination(d)}
              className={cn(
                'text-xs px-3 py-1 rounded transition-colors',
                destination === d
                  ? d === 'local'
                    ? 'bg-card text-primary shadow-sm'
                    : 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              title={d === 'local' ? 'Save to workspace/skills/' : 'Save to ~/.claude/skills/'}
            >
              {d === 'local' ? 'Local' : 'Global'}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground">
          {destination === 'local' ? 'workspace/skills/' : '~/.claude/skills/'}
        </span>
      </div>

      {/* Input area */}
      <div className="flex flex-col gap-2">
        {mode === 'url' && (
          <div className="relative">
            <Input
              type="url"
              placeholder="https://github.com/some-tool or any webpage…"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setGenError(null);
              }}
              className="font-mono text-xs"
            />
          </div>
        )}

        <div className="relative">
          <textarea
            rows={mode === 'url' ? 2 : 3}
            placeholder={
              mode === 'prompt'
                ? 'Describe the skill… e.g. "A skill for writing Git commit messages with conventional commits format"'
                : 'Optional: add extra context or instructions for the skill…'
            }
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              setGenError(null);
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') generate();
            }}
            className={cn(
              'w-full resize-none rounded-lg border bg-card text-sm text-foreground',
              'placeholder:text-muted-foreground/50 px-3 py-2 pr-10 outline-none transition-colors',
              'focus:border-primary/60 border-border',
            )}
          />
          <button
            onClick={generate}
            disabled={!hasInput || generating}
            className={cn(
              'absolute right-2.5 bottom-2.5 p-1 rounded transition-colors',
              hasInput && !generating
                ? 'text-primary hover:bg-primary/10'
                : 'text-muted-foreground/30',
            )}
            title="Generate (⌘↵)"
          >
            <Send className={cn('h-3.5 w-3.5', generating && 'animate-pulse')} />
          </button>
        </div>

        {generating && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Asking Claude{mode === 'url' ? ' (fetching URL first…)' : '…'}
          </div>
        )}

        {genError && (
          <div className="flex items-start gap-2 text-xs text-destructive border border-destructive/40 bg-destructive/10 rounded p-2.5">
            <span className="flex-1">{genError}</span>
            <button onClick={() => setGenError(null)}>
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Draft preview */}
      {draft && (
        <div className="flex flex-col gap-3 border-t border-border/50 pt-4">
          <span className="text-[10px] text-muted-foreground tracking-widest uppercase">
            Preview — edit before saving
          </span>

          {/* Name */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground tracking-widest uppercase">
              Name
            </span>
            <input
              value={draft.name}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  name: e.target.value,
                  rawContent: draft.rawContent.replace(/^name:\s*.+$/m, `name: ${e.target.value}`),
                })
              }
              className="bg-transparent border-b border-border/50 focus:border-primary/60 outline-none text-sm font-mono text-foreground py-0.5 transition-colors"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground tracking-widest uppercase">
              Description
            </span>
            <input
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              className="bg-transparent border-b border-border/50 focus:border-primary/60 outline-none text-sm text-foreground py-0.5 transition-colors"
            />
          </div>

          {/* Tags */}
          {draft.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {draft.tags.map((t) => (
                <Tag key={t} label={t} />
              ))}
            </div>
          )}

          {/* Instructions preview */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground tracking-widest uppercase">
              Instructions
            </span>
            <pre className="text-xs text-muted-foreground/80 font-mono whitespace-pre-wrap bg-muted/30 rounded p-3 max-h-48 overflow-y-auto leading-relaxed">
              {draft.instructions || '(empty)'}
            </pre>
          </div>

          {saveError && (
            <div className="text-xs text-destructive border border-destructive/40 bg-destructive/10 rounded p-2">
              {saveError}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
              Discard
            </Button>
            <Button variant="primary" size="sm" onClick={save} disabled={saving || !draft.name}>
              {saving ? 'Saving…' : 'Save Skill'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Skill Card ───────────────────────────────────────────────

interface SkillCardProps {
  skill: SkillSummary;
  expanded: boolean;
  onToggle: () => void;
  onDeleted: (name: string) => void;
  activeTag: string | null;
  onTagClick: (tag: string) => void;
}

function SkillCard({
  skill,
  expanded,
  onToggle,
  onDeleted,
  activeTag,
  onTagClick,
}: SkillCardProps) {
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(skill.name)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      onDeleted(skill.name);
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : String(err));
      setDeleting(false);
    }
  }

  async function loadDetail() {
    if (detail) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(skill.name)}`);
      if (res.ok) setDetail(await res.json());
    } finally {
      setLoading(false);
    }
  }

  function handleToggle() {
    onToggle();
    if (!expanded) loadDetail();
  }

  return (
    <div
      className={cn(
        'border rounded-lg transition-colors',
        expanded
          ? 'border-primary/40 bg-primary/5'
          : 'border-border bg-card hover:border-border/80',
      )}
    >
      <div className="flex items-start gap-0">
        <button
          className="flex-1 text-left px-4 py-3 flex items-start gap-3"
          onClick={handleToggle}
        >
          <span className="mt-0.5 flex-shrink-0 text-muted-foreground/50">
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-primary" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-foreground">{skill.name}</span>
              {skill.source === 'global' ? (
                <span className="text-[9px] px-1.5 py-0.5 rounded border border-border text-muted-foreground/60 tracking-wide">
                  global
                </span>
              ) : (
                <span className="text-[9px] px-1.5 py-0.5 rounded border border-primary/30 text-primary/70 tracking-wide">
                  local
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground leading-snug">{skill.description}</p>
            {skill.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {skill.tags.map((tag) => (
                  <Tag
                    key={tag}
                    label={tag}
                    active={activeTag === tag}
                    onClick={() => onTagClick(tag)}
                  />
                ))}
              </div>
            )}
          </div>
        </button>
        {skill.source === 'local' && (
          <div className="flex-shrink-0 pr-3 pt-3">
            <Button
              variant="destructive"
              size="icon"
              onClick={handleDelete}
              disabled={deleting}
              title="Delete skill"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
      {deleteError && (
        <div className="mx-4 mb-2 text-xs text-destructive border border-destructive/40 bg-destructive/10 rounded p-2">
          {deleteError}
        </div>
      )}

      {expanded && (
        <div className="px-4 pb-4 border-t border-border/50 pt-3 flex flex-col gap-4">
          {loading && <p className="text-xs text-muted-foreground">Loading…</p>}
          {detail && (
            <>
              {(detail.scripts.length > 0 || detail.examples.length > 0) && (
                <div className="flex gap-4 text-xs text-muted-foreground">
                  {detail.scripts.length > 0 && (
                    <span>
                      <span className="text-foreground font-medium">{detail.scripts.length}</span>{' '}
                      script{detail.scripts.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {detail.examples.length > 0 && (
                    <span>
                      <span className="text-foreground font-medium">{detail.examples.length}</span>{' '}
                      example{detail.examples.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  <span className="ml-auto font-mono opacity-40 truncate max-w-[200px] text-[10px]">
                    {detail.path.split('/').slice(-3).join('/')}
                  </span>
                </div>
              )}
              <div>
                <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-2">
                  Instructions
                </div>
                <pre className="text-xs text-muted-foreground/80 font-mono whitespace-pre-wrap bg-muted/30 rounded p-3 max-h-60 overflow-y-auto leading-relaxed">
                  {detail.instructions || '(no instructions)'}
                </pre>
              </div>
              {detail.scripts.length > 0 && (
                <div>
                  <div className="text-[10px] text-muted-foreground tracking-widest uppercase mb-1.5">
                    Scripts
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.scripts.map((s) => (
                      <span
                        key={s}
                        className="font-mono text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border"
                      >
                        {s.split('/').pop()}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [expandedName, setExpandedName] = useState<string | null>(null);
  const [showAddPanel, setShowAddPanel] = useState(false);

  const fetchSkills = useCallback(async () => {
    try {
      const res = await fetch('/api/skills');
      if (!res.ok) throw new Error('Failed to load skills');
      setSkills(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  const allTags = [...new Set(skills.flatMap((s) => s.tags))].sort();

  const filtered = skills.filter((s) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tags.some((t) => t.toLowerCase().includes(q));
    const matchesTag = !activeTag || s.tags.includes(activeTag);
    return matchesSearch && matchesTag;
  });

  function handleSaved(skill: SkillSummary) {
    setSkills((prev) => [...prev, skill]);
    setShowAddPanel(false);
    setExpandedName(skill.name);
  }

  return (
    <div className="flex flex-col flex-1 p-6 gap-6 max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-[0.2em] uppercase text-primary">SKILLS</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Workspace skills loaded from{' '}
            <code className="font-mono text-xs">workspace/skills/</code> and{' '}
            <code className="font-mono text-xs">~/.claude/skills/</code>
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowAddPanel((v) => !v)}>
          <Plus className="h-3 w-3 mr-1.5" />
          Add Skill
        </Button>
      </div>

      {/* Add skill panel */}
      {showAddPanel && (
        <AddSkillPanel onSaved={handleSaved} onClose={() => setShowAddPanel(false)} />
      )}

      {/* Search + tag filters */}
      {!loading && skills.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <Input
              placeholder="Search skills…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((tag) => (
                <Tag
                  key={tag}
                  label={tag}
                  active={activeTag === tag}
                  onClick={() => setActiveTag((p) => (p === tag ? null : tag))}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive text-sm p-4">
          {error}
        </div>
      )}

      {!loading && !error && skills.length === 0 && !showAddPanel && (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center py-20">
          <Zap className="h-10 w-10 text-muted-foreground/20" />
          <p className="text-muted-foreground text-sm">No skills loaded.</p>
          <p className="text-muted-foreground/50 text-xs">
            Add skill directories to <code className="font-mono">workspace/skills/</code> or
            generate one above.
          </p>
          <Button variant="primary" size="sm" onClick={() => setShowAddPanel(true)}>
            <Plus className="h-3 w-3 mr-1.5" /> Add Skill
          </Button>
        </div>
      )}

      {!loading && skills.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No skills match{search ? ` "${search}"` : ''}
          {activeTag ? ` [${activeTag}]` : ''}.
        </p>
      )}

      {filtered.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-muted-foreground tracking-wider uppercase">
            {filtered.length} skill{filtered.length !== 1 ? 's' : ''}
            {(search || activeTag) && ' · filtered'}
          </div>
          {filtered.map((skill) => (
            <SkillCard
              key={skill.name}
              skill={skill}
              expanded={expandedName === skill.name}
              onToggle={() => setExpandedName((p) => (p === skill.name ? null : skill.name))}
              onDeleted={(name) => {
                setSkills((prev) => prev.filter((s) => s.name !== name));
                setExpandedName((p) => (p === name ? null : p));
              }}
              activeTag={activeTag}
              onTagClick={(tag) => setActiveTag((p) => (p === tag ? null : tag))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
