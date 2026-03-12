import { useState, useEffect, useRef } from 'react';
import type { KanbanTask, TaskPriority } from '@neo-agent/shared';
import { X, Download, RotateCcw, Wrench } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTaskStore } from '../stores/task-store';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { ScrollArea } from './ui/scroll-area';
import { cn } from '../lib/utils';

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'critical'];
const MODELS: KanbanTask['model'][] = ['sonnet', 'opus', 'haiku'];

export default function TaskDetailPanel() {
  const tasks = useTaskStore((s) => s.tasks);
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId);
  const selectTask = useTaskStore((s) => s.selectTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const retryTask = useTaskStore((s) => s.retryTask);
  const agentActivities = useTaskStore((s) => s.agentActivities);

  const task = tasks.find((t) => t.id === selectedTaskId);
  const activities = selectedTaskId ? (agentActivities[selectedTaskId] ?? []) : [];
  const lastActivity = activities[activities.length - 1];
  const isAgentWorking =
    task?.status === 'in_progress' &&
    lastActivity &&
    lastActivity.type !== 'completed' &&
    lastActivity.type !== 'failed';

  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPriority, setEditPriority] = useState<TaskPriority>('medium');
  const [editModel, setEditModel] = useState<KanbanTask['model']>('sonnet');
  const [editNotes, setEditNotes] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (task) {
      setEditTitle(task.title);
      setEditDesc(task.description);
      setEditPriority(task.priority);
      setEditModel(task.model ?? 'sonnet');
      setEditNotes(task.notes ?? '');
    }
  }, [task?.id, task?.title, task?.description, task?.priority, task?.model, task?.notes]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [activities.length]);

  if (!task) return null;

  function handleSave() {
    if (!task) return;
    updateTask(task.id, {
      title: editTitle,
      description: editDesc,
      priority: editPriority,
      model: editModel,
      notes: editNotes,
    });
    selectTask(null);
  }

  function handleDelete() {
    if (!task) return;
    deleteTask(task.id);
  }

  function handleRetry() {
    if (!task) return;
    retryTask(task.id);
  }

  // Show result: either from live completed event or persisted DB value
  const liveResult = activities.find((a) => a.type === 'completed')?.message;
  const result = liveResult ?? task.agentResult;
  const showResult = (task.status === 'review' || task.status === 'done') && result;

  function handleDownload() {
    if (!result || !task) return;
    const blob = new Blob([result], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${task.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-result.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function activityIcon(type: string, eventKind?: string) {
    if (type === 'assigned') return '⊕';
    if (type === 'completed') return '✓';
    if (type === 'failed') return '✗';
    if (eventKind === 'tool_use') return null; // rendered with Wrench icon
    return '›';
  }

  return (
    <div className="fixed top-0 right-0 bottom-0 w-[420px] bg-card border-l border-border flex flex-col shadow-2xl z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-[11px] text-muted-foreground tracking-widest uppercase">
          Task Details
        </span>
        <div className="flex items-center gap-1">
          {task.status === 'error' && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[11px] gap-1 mr-1 border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={handleRetry}
            >
              <RotateCcw className="h-3 w-3" />
              Retry
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => selectTask(null)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-4">
          {/* Edit fields */}
          <Input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="text-sm font-medium"
          />
          <Textarea
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            rows={3}
            placeholder="Description..."
          />

          {/* Priority + Model row */}
          <div className="flex gap-4 flex-wrap">
            <div>
              <label className="text-[11px] text-muted-foreground uppercase tracking-wider block mb-1.5">
                Priority
              </label>
              <div className="flex gap-1.5">
                {PRIORITIES.map((p) => (
                  <button
                    key={p}
                    onClick={() => setEditPriority(p)}
                    className={cn(
                      'text-[10px] px-2 py-0.5 rounded border font-mono uppercase tracking-wide transition-colors',
                      editPriority === p
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/30',
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground uppercase tracking-wider block mb-1.5">
                Model
              </label>
              <div className="flex gap-1.5">
                {MODELS.map((m) => (
                  <button
                    key={m}
                    onClick={() => setEditModel(m)}
                    className={cn(
                      'text-[10px] px-2 py-0.5 rounded border font-mono uppercase tracking-wide transition-colors',
                      editModel === m
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/30',
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider block mb-1.5">
              Notes
            </label>
            <Textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              rows={2}
              placeholder="Private notes (not sent to agent)..."
              className="text-[12px]"
            />
          </div>

          {/* Agent Result (persisted) */}
          {showResult && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] text-muted-foreground uppercase tracking-wider">
                  Agent Result
                </label>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
                  title="Download as .md"
                >
                  <Download className="h-3 w-3" />
                  <span>.md</span>
                </button>
              </div>
              <div className="bg-background border border-border rounded-md p-3 text-[12px] text-foreground leading-relaxed max-h-[300px] overflow-y-auto markdown-result">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{result!}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* Live Agent Activity */}
          {activities.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <label className="text-[11px] text-muted-foreground uppercase tracking-wider">
                  Agent Activity
                </label>
                {isAgentWorking && (
                  <span className="text-primary text-[10px] animate-[agent-pulse_1.2s_ease-in-out_infinite]">
                    ●
                  </span>
                )}
                {lastActivity?.agentName && (
                  <span className="text-[11px] text-primary/70 ml-auto">
                    {lastActivity.agentName}
                  </span>
                )}
              </div>
              <div
                ref={logRef}
                className="bg-background border border-border rounded-md p-2 max-h-[240px] overflow-y-auto flex flex-col gap-0.5 font-mono"
              >
                {activities.map((entry, i) => {
                  const isToolUse = entry.eventKind === 'tool_use';
                  const icon = activityIcon(entry.type, entry.eventKind);
                  return (
                    <div
                      key={i}
                      className={cn(
                        'flex items-start gap-1.5 text-[11px] py-0.5 px-1 rounded',
                        isToolUse && 'bg-amber-500/5',
                      )}
                    >
                      {isToolUse ? (
                        <Wrench className="h-2.5 w-2.5 text-amber-500/80 shrink-0 mt-0.5" />
                      ) : (
                        <span
                          className={cn(
                            'shrink-0 w-3 text-center',
                            entry.type === 'completed'
                              ? 'text-primary'
                              : entry.type === 'failed'
                                ? 'text-destructive'
                                : entry.type === 'assigned'
                                  ? 'text-primary/70'
                                  : 'text-muted-foreground',
                          )}
                        >
                          {icon}
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        {isToolUse && entry.toolName && (
                          <span className="text-amber-500/90 font-semibold mr-1.5">
                            {entry.toolName}
                          </span>
                        )}
                        <span
                          className={cn(
                            'break-words leading-snug',
                            entry.type === 'failed'
                              ? 'text-destructive'
                              : isToolUse
                                ? 'text-amber-200/70'
                                : 'text-foreground/70',
                          )}
                        >
                          {entry.message}
                        </span>
                        {entry.type === 'completed' && entry.durationMs && (
                          <span className="text-muted-foreground ml-1 text-[10px]">
                            ({(entry.durationMs / 1000).toFixed(1)}s)
                          </span>
                        )}
                      </div>
                      <span className="text-muted-foreground/50 whitespace-nowrap text-[10px] shrink-0">
                        {new Date(entry.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Meta */}
          <div className="text-[11px] text-muted-foreground flex flex-col gap-1 pt-1 border-t border-border">
            <div>
              Status: <span className="text-foreground/70">{task.status.replace('_', ' ')}</span>
            </div>
            {task.model && task.model !== 'sonnet' && (
              <div>
                Model: <span className="text-foreground/70 font-mono">{task.model}</span>
              </div>
            )}
            <div>
              Created:{' '}
              <span className="text-foreground/70">
                {new Date(task.createdAt).toLocaleString()}
              </span>
            </div>
            {task.sessionId && (
              <div>
                Session: <span className="text-foreground/70">{task.sessionId.slice(0, 12)}</span>
              </div>
            )}
            {task.completedAt && (
              <div>
                Completed:{' '}
                <span className="text-foreground/70">
                  {new Date(task.completedAt).toLocaleString()}
                </span>
              </div>
            )}
            <div className="text-[10px] font-mono text-muted-foreground/40">#{task.id}</div>
          </div>
        </div>
      </ScrollArea>

      {/* Footer actions */}
      <div className="flex gap-2 p-4 border-t border-border">
        <Button variant="destructive" size="sm" onClick={handleDelete}>
          Delete
        </Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => selectTask(null)}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={handleSave}>
          Save
        </Button>
      </div>
    </div>
  );
}
