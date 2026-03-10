import { useState } from 'react';
import type { TaskPriority } from '@neo-agent/shared';
import { useTaskStore } from '../stores/task-store';
import {
  TASK_PRIORITIES,
  inputStyle,
  textareaStyle,
  buttonGhost,
  buttonPrimary,
  priorityToggleStyle,
} from '../styles/common';

interface Props {
  onClose: () => void;
}

export default function TaskCreateForm({ onClose }: Props) {
  const createTask = useTaskStore((s) => s.createTask);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await createTask(title.trim(), { description: description.trim(), priority });
    onClose();
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px',
          width: '400px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <h3 style={{ color: 'var(--text-primary)', fontSize: '14px', letterSpacing: '0.1em' }}>
          NEW TASK
        </h3>
        <input
          autoFocus
          placeholder="Task title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={inputStyle}
        />
        <textarea
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          style={textareaStyle}
        />
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Priority:</label>
          {TASK_PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriority(p)}
              style={priorityToggleStyle(priority === p)}
            >
              {p}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={buttonGhost}>
            Cancel
          </button>
          <button type="submit" style={buttonPrimary}>
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
