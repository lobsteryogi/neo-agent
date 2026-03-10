import type { TaskPriority } from '@neo-agent/shared';

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string }> = {
  low: { label: 'LOW', color: 'var(--priority-low)' },
  medium: { label: 'MED', color: 'var(--priority-medium)' },
  high: { label: 'HIGH', color: 'var(--priority-high)' },
  critical: { label: 'CRIT', color: 'var(--priority-critical)' },
};

export default function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <span
      style={{
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.08em',
        color: cfg.color,
        border: `1px solid ${cfg.color}40`,
        borderRadius: '3px',
        padding: '1px 5px',
        lineHeight: '16px',
      }}
    >
      {cfg.label}
    </span>
  );
}
