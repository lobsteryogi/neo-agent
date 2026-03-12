import type { KanbanTask, TaskStatus } from '@neo-agent/shared';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { Plus, ChevronDown, ChevronRight } from 'lucide-react';
import TaskCard from './TaskCard';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

const COLUMN_BG: Record<TaskStatus, string> = {
  backlog: 'bg-[var(--col-backlog)]',
  in_progress: 'bg-[var(--col-in-progress)]',
  review: 'bg-[var(--col-review)]',
  done: 'bg-[var(--col-done)]',
  error: 'bg-[var(--col-error)]',
};

interface Props {
  id: TaskStatus;
  label: string;
  tasks: KanbanTask[];
  onAddClick?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function KanbanColumn({
  id,
  label,
  tasks,
  onAddClick,
  isCollapsed,
  onToggleCollapse,
}: Props) {
  const { setNodeRef } = useDroppable({ id });
  const taskIds = tasks.map((t) => t.id);

  if (isCollapsed) {
    return (
      <div
        className={cn(
          'w-10 flex flex-col items-center rounded-xl border border-border overflow-hidden shrink-0 cursor-pointer',
          COLUMN_BG[id],
        )}
        onClick={onToggleCollapse}
        title={`${label} (${tasks.length})`}
      >
        <div className="flex flex-col items-center gap-1.5 py-3">
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span
            className={cn(
              'text-[10px] font-semibold tracking-widest uppercase writing-vertical',
              id === 'error' ? 'text-destructive' : 'text-primary',
            )}
            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
          >
            {label}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">{tasks.length}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-1 min-w-[260px] max-w-[340px] flex flex-col rounded-xl border border-border overflow-hidden',
        COLUMN_BG[id],
      )}
    >
      <div className="flex items-center justify-between px-3.5 pt-3 pb-2">
        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-1.5 hover:opacity-70 transition-opacity"
        >
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
          <span
            className={cn(
              'text-[11px] font-semibold tracking-widest uppercase',
              id === 'error' ? 'text-destructive' : 'text-primary',
            )}
          >
            {label}
            <span className="text-muted-foreground ml-2 font-normal">{tasks.length}</span>
          </span>
        </button>
        {id === 'backlog' && onAddClick && (
          <Button variant="ghost" size="icon" onClick={onAddClick} className="h-6 w-6">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <div className="flex-1 px-2 pb-2 flex flex-col gap-1.5 overflow-y-auto">
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
