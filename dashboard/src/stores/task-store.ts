import type { AgentActivityEvent, KanbanTask, TaskPriority, TaskStatus } from '@neo-agent/shared';
import { create } from 'zustand';

interface TaskState {
  tasks: KanbanTask[];
  loading: boolean;
  selectedTaskId: string | null;
  selectedTaskIds: Set<string>;
  searchQuery: string;
  agentActivities: Record<string, AgentActivityEvent[]>;

  fetchTasks: () => Promise<void>;
  createTask: (
    title: string,
    opts?: { description?: string; priority?: TaskPriority; model?: KanbanTask['model'] },
  ) => Promise<void>;
  updateTask: (id: string, fields: Partial<KanbanTask>) => Promise<void>;
  moveTask: (id: string, status: TaskStatus, position: number) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  retryTask: (id: string) => Promise<void>;
  bulkDelete: () => Promise<void>;
  bulkRequeue: () => Promise<void>;
  selectTask: (id: string | null) => void;
  toggleSelectTask: (id: string) => void;
  clearSelection: () => void;
  setSearchQuery: (q: string) => void;
  applyEvent: (event: { type: string; [key: string]: unknown }) => void;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  loading: false,
  selectedTaskId: null,
  selectedTaskIds: new Set(),
  searchQuery: '',
  agentActivities: {},

  fetchTasks: async () => {
    set({ loading: true });
    try {
      const res = await fetch('/api/tasks');
      const tasks = await res.json();
      set({ tasks, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createTask: async (title, opts) => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, ...opts }),
      });
      const task = await res.json();
      set((s) => {
        if (s.tasks.some((t) => t.id === task.id)) return s;
        return { tasks: [...s.tasks, task] };
      });
    } catch {
      // Rollback not needed — nothing was optimistically added
    }
  },

  updateTask: async (id, fields) => {
    const prev = get().tasks;
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...fields, updatedAt: Date.now() } : t)),
    }));
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error('update failed');
      const task = await res.json();
      set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? task : t)) }));
    } catch {
      set({ tasks: prev });
    }
  },

  moveTask: async (id, status, position) => {
    const prev = get().tasks;
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              status,
              position,
              updatedAt: Date.now(),
              completedAt: status === 'done' ? Date.now() : undefined,
            }
          : t,
      ),
    }));
    try {
      const res = await fetch(`/api/tasks/${id}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, position }),
      });
      if (!res.ok) throw new Error('move failed');
      const task = await res.json();
      set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? task : t)) }));
    } catch {
      set({ tasks: prev });
    }
  },

  deleteTask: async (id) => {
    const prev = get().tasks;
    set((s) => ({
      tasks: s.tasks.filter((t) => t.id !== id),
      selectedTaskId: s.selectedTaskId === id ? null : s.selectedTaskId,
    }));
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
    } catch {
      set({ tasks: prev });
    }
  },

  retryTask: async (id) => {
    try {
      const res = await fetch(`/api/tasks/${id}/retry`, { method: 'POST' });
      if (!res.ok) throw new Error('retry failed');
      const task = await res.json();
      set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? task : t)) }));
    } catch {
      // no-op
    }
  },

  bulkDelete: async () => {
    const ids = [...get().selectedTaskIds];
    if (ids.length === 0) return;
    const prev = get().tasks;
    set((s) => ({ tasks: s.tasks.filter((t) => !ids.includes(t.id)), selectedTaskIds: new Set() }));
    try {
      const res = await fetch('/api/tasks/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error('bulk delete failed');
    } catch {
      set({ tasks: prev });
    }
  },

  bulkRequeue: async () => {
    const ids = [...get().selectedTaskIds];
    if (ids.length === 0) return;
    try {
      const res = await fetch('/api/tasks/bulk-requeue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error('bulk requeue failed');
      const { tasks: updatedTasks } = await res.json().catch(() => ({ tasks: [] }));
      // Server will broadcast task:moved for each; optimistically clear selection
      set({ selectedTaskIds: new Set() });
      if (updatedTasks?.length) {
        set((s) => {
          const map = new Map<string, KanbanTask>(updatedTasks.map((t: KanbanTask) => [t.id, t]));
          return { tasks: s.tasks.map((t) => map.get(t.id) ?? t) };
        });
      }
    } catch {
      // WS events will update state
    }
  },

  selectTask: (id) => set({ selectedTaskId: id }),

  toggleSelectTask: (id) =>
    set((s) => {
      const next = new Set(s.selectedTaskIds);
      next.has(id) ? next.delete(id) : next.add(id);
      return { selectedTaskIds: next };
    }),

  clearSelection: () => set({ selectedTaskIds: new Set() }),

  setSearchQuery: (q) => set({ searchQuery: q }),

  applyEvent: (event) => {
    const { type } = event;
    if (type === 'task:created') {
      const task = event.task as KanbanTask;
      set((s) => {
        if (s.tasks.some((t) => t.id === task.id)) return s;
        return { tasks: [...s.tasks, task] };
      });
    } else if (type === 'task:updated' || type === 'task:moved') {
      const task = event.task as KanbanTask;
      set((s) => ({ tasks: s.tasks.map((t) => (t.id === task.id ? task : t)) }));
    } else if (type === 'task:deleted') {
      const id = event.id as string;
      set((s) => ({
        tasks: s.tasks.filter((t) => t.id !== id),
        selectedTaskId: s.selectedTaskId === id ? null : s.selectedTaskId,
      }));
    } else if (type.startsWith('agent:')) {
      const eventType = type.replace('agent:', '') as AgentActivityEvent['type'];
      const entry: AgentActivityEvent = {
        type: eventType,
        taskId: event.taskId as string,
        agentName: event.agentName as string,
        timestamp: event.timestamp as number,
        message: event.message as string,
        durationMs: event.durationMs as number | undefined,
        error: event.error as string | undefined,
        eventKind: event.eventKind as AgentActivityEvent['eventKind'],
        toolName: event.toolName as string | undefined,
      };
      set((s) => ({
        agentActivities: {
          ...s.agentActivities,
          [entry.taskId]: [...(s.agentActivities[entry.taskId] ?? []), entry],
        },
      }));
    }
  },
}));
