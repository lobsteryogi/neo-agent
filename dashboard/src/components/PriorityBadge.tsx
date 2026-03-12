import type { TaskPriority } from '@neo-agent/shared';
import { Badge } from './ui/badge';

export default function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <Badge variant={priority} className="shrink-0 uppercase">
      {priority}
    </Badge>
  );
}
