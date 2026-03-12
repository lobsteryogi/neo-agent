import type { KanbanTask } from '@neo-agent/shared';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import PriorityBadge from './PriorityBadge';
import { useTaskStore } from '../stores/task-store';
import { useElapsedTimer } from '../hooks/useElapsedTimer';
import { cn } from '../lib/utils';

export default function TaskCard({ task }: { task: KanbanTask }) {
  const selectTask = useTaskStore((s) => s.selectTask);
  const agentActivities = useTaskStore((s) => s.agentActivities);
  const selectedTaskIds = useTaskStore((s) => s.selectedTaskIds);
  const toggleSelectTask = useTaskStore((s) => s.toggleSelectTask);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const activities = agentActivities[task.id] ?? [];
  const lastActivity = activities[activities.length - 1];
  const isAgentWorking =
    task.status === 'in_progress' &&
    lastActivity &&
    lastActivity.type !== 'completed' &&
    lastActivity.type !== 'failed';
  const isCompleted = lastActivity?.type === 'completed';
  const isFailed = lastActivity?.type === 'failed';
  const isSelected = selectedTaskIds.has(task.id);

  const elapsed = useElapsedTimer(task.startedAt, task.status === 'in_progress');

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => selectTask(task.id)}
      className={cn(
        'bg-card border rounded-md px-3 py-2.5 cursor-grab flex flex-col gap-1.5 select-none',
        'hover:border-primary/30 transition-colors',
        isAgentWorking && 'border-primary/40 shadow-[0_0_8px_hsl(var(--primary)/0.2)]',
        isFailed && 'border-destructive/30',
        isSelected && 'border-primary/60 bg-primary/5',
        isDragging && 'opacity-50',
      )}
    >
      {/* Title row */}
      <div className="flex items-center gap-2 justify-between">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => toggleSelectTask(task.id)}
          onClick={(e) => e.stopPropagation()}
          className="h-3 w-3 shrink-0 accent-primary cursor-pointer"
        />
        <span className="text-[13px] text-foreground font-medium truncate leading-tight flex-1">
          {task.title}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground/40 shrink-0">
          #{task.id.slice(0, 6)}
        </span>
        <PriorityBadge priority={task.priority} />
      </div>

      {/* Labels */}
      {task.labels.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {task.labels.map((label) => (
            <span
              key={label}
              className="text-[10px] text-primary/60 bg-primary/10 rounded px-1.5 py-0.5"
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Model badge */}
      {task.model && task.model !== 'sonnet' && (
        <span className="text-[10px] font-mono text-muted-foreground/60 self-start">
          {task.model}
        </span>
      )}

      {/* Agent working indicator */}
      {isAgentWorking && (
        <div className="flex items-center gap-1.5 text-[10px] text-primary border-t border-border pt-1.5 mt-0.5">
          <span className="animate-[agent-pulse_1.2s_ease-in-out_infinite]">●</span>
          <span className="font-semibold">{lastActivity.agentName}</span>
          <span className="text-muted-foreground truncate">
            {lastActivity.message.slice(0, 40)}
            {lastActivity.message.length > 40 ? '…' : ''}
          </span>
          {elapsed !== null && (
            <span className="ml-auto text-muted-foreground shrink-0">{elapsed}s</span>
          )}
        </div>
      )}

      {/* Completed indicator */}
      {isCompleted && (task.status === 'review' || task.status === 'done') && (
        <div className="flex items-center gap-1.5 text-[10px] text-primary/70 border-t border-border pt-1.5 mt-0.5">
          <span>✓</span>
          <span>{lastActivity.agentName}</span>
          {lastActivity.durationMs && (
            <span className="text-muted-foreground ml-auto">
              {(lastActivity.durationMs / 1000).toFixed(0)}s
            </span>
          )}
        </div>
      )}

      {/* Agent result preview for done tasks (from DB) */}
      {task.status === 'done' && task.agentResult && !isCompleted && (
        <div className="text-[10px] text-muted-foreground border-t border-border pt-1.5 mt-0.5 line-clamp-2">
          {task.agentResult.slice(0, 120)}
        </div>
      )}

      {/* Failed indicator */}
      {isFailed && (
        <div className="flex items-center gap-1.5 text-[10px] text-destructive border-t border-border pt-1.5 mt-0.5">
          <span>✗</span>
          <span className="truncate">
            {(lastActivity.error ?? lastActivity.message).slice(0, 50)}
          </span>
        </div>
      )}
    </div>
  );
}
