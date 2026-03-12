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
      <div className="flex-1 flex items-center justify-center text-primary/40 text-sm tracking-widest animate-pulse">
        Loading tasks...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <KanbanBoard />
      {selectedTaskId && <TaskDetailPanel />}
    </div>
  );
}
