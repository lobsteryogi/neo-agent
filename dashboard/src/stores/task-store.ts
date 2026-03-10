import type { KanbanTask, TaskPriority, TaskStatus } from '@neo-agent/shared';
import { create } from 'zustand';

interface TaskState {
  tasks: KanbanTask[];
  loading: boolean;
  selectedTaskId: string | null;

  fetchTasks: () => Promise<void>;
  createTask: (
    title: string,
    opts?: { description?: string; priority?: TaskPriority },
  ) => Promise<void>;
  updateTask: (id: string, fields: Partial<KanbanTask>) => Promise<void>;
  moveTask: (id: string, status: TaskStatus, position: number) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  selectTask: (id: string | null) => void;
  applyEvent: (event: { type: string; [key: string]: unknown }) => void;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  loading: false,
  selectedTaskId: null,

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
      set((s) => ({ tasks: [...s.tasks, task] }));
    } catch {
      // Rollback not needed — nothing was optimistically added
    }
  },

  updateTask: async (id, fields) => {
    const prev = get().tasks;
    // Optimistic update
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
      set({ tasks: prev }); // Rollback
    }
  },

  moveTask: async (id, status, position) => {
    const prev = get().tasks;
    // Optimistic move
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
      set({ tasks: prev }); // Rollback
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
      set({ tasks: prev }); // Rollback
    }
  },

  selectTask: (id) => set({ selectedTaskId: id }),

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
    }
  },
}));
