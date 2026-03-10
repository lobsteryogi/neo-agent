import type { KanbanTask, TaskStatus } from '@neo-agent/shared';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import TaskCard from './TaskCard';

const COLUMN_COLORS: Record<TaskStatus, string> = {
  backlog: 'var(--column-backlog)',
  in_progress: 'var(--column-in-progress)',
  review: 'var(--column-review)',
  done: 'var(--column-done)',
};

interface Props {
  id: TaskStatus;
  label: string;
  tasks: KanbanTask[];
  onAddClick?: () => void;
}

export default function KanbanColumn({ id, label, tasks, onAddClick }: Props) {
  const { setNodeRef } = useDroppable({ id });
  const taskIds = tasks.map((t) => t.id);

  return (
    <div
      ref={setNodeRef}
      style={{
        flex: 1,
        minWidth: '260px',
        maxWidth: '340px',
        display: 'flex',
        flexDirection: 'column',
        background: COLUMN_COLORS[id],
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px 8px',
        }}
      >
        <span
          style={{
            fontSize: '12px',
            fontWeight: 600,
            letterSpacing: '0.1em',
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
          }}
        >
          {label}
          <span style={{ color: 'var(--text-muted)', marginLeft: '8px', fontWeight: 400 }}>
            {tasks.length}
          </span>
        </span>
        {id === 'backlog' && onAddClick && (
          <button
            onClick={onAddClick}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              borderRadius: 'var(--radius)',
              padding: '2px 8px',
              fontSize: '16px',
              cursor: 'pointer',
              lineHeight: '20px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            +
          </button>
        )}
      </div>
      <div
        style={{
          flex: 1,
          padding: '4px 8px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          overflowY: 'auto',
        }}
      >
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
