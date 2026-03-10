import { useEffect } from 'react';
import KanbanBoard from '../components/KanbanBoard';
import TaskDetailPanel from '../components/TaskDetailPanel';
import { useWebSocket } from '../hooks/use-websocket';
import { useTaskStore } from '../stores/task-store';

export default function KanbanPage() {
  const fetchTasks = useTaskStore((s) => s.fetchTasks);
  const loading = useTaskStore((s) => s.loading);
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId);

  useWebSocket();

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  if (loading) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-dim)',
        }}
      >
        Loading tasks...
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <KanbanBoard />
      {selectedTaskId && <TaskDetailPanel />}
    </div>
  );
}
