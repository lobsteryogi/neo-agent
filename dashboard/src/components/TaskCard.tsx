import type { KanbanTask } from '@neo-agent/shared';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import PriorityBadge from './PriorityBadge';
import { useTaskStore } from '../stores/task-store';

export default function TaskCard({ task }: { task: KanbanTask }) {
  const selectTask = useTaskStore((s) => s.selectTask);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '10px 12px',
    cursor: 'grab',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => selectTask(task.id)}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: '13px',
            color: 'var(--text-white)',
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {task.title}
        </span>
        <PriorityBadge priority={task.priority} />
      </div>
      {task.labels.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {task.labels.map((label) => (
            <span
              key={label}
              style={{
                fontSize: '10px',
                color: 'var(--text-dim)',
                background: 'var(--accent-dim)',
                borderRadius: '3px',
                padding: '1px 6px',
              }}
            >
              {label}
            </span>
          ))}
        </div>
      )}
      {task.sessionId && (
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
          session: {task.sessionId.slice(0, 8)}
        </span>
      )}
    </div>
  );
}
