import { useState, useEffect } from 'react';
import type { KanbanTask, TaskPriority } from '@neo-agent/shared';
import { useTaskStore } from '../stores/task-store';
import {
  TASK_PRIORITIES,
  inputStyle,
  textareaStyle,
  buttonGhost,
  buttonPrimary,
  buttonDanger,
  priorityToggleStyle,
} from '../styles/common';

export default function TaskDetailPanel() {
  const tasks = useTaskStore((s) => s.tasks);
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId);
  const selectTask = useTaskStore((s) => s.selectTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);

  const task = tasks.find((t) => t.id === selectedTaskId);

  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPriority, setEditPriority] = useState<TaskPriority>('medium');

  useEffect(() => {
    if (task) {
      setEditTitle(task.title);
      setEditDesc(task.description);
      setEditPriority(task.priority);
    }
  }, [task?.id, task?.title, task?.description, task?.priority]);

  if (!task) return null;

  function handleSave() {
    if (!task) return;
    updateTask(task.id, {
      title: editTitle,
      description: editDesc,
      priority: editPriority,
    });
    selectTask(null);
  }

  function handleDelete() {
    if (!task) return;
    deleteTask(task.id);
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '380px',
        background: 'var(--bg-secondary)',
        borderLeft: '1px solid var(--border)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        zIndex: 50,
        overflowY: 'auto',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
          TASK DETAILS
        </span>
        <button
          onClick={() => selectTask(null)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: '18px',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
          }}
        >
          x
        </button>
      </div>

      <input
        value={editTitle}
        onChange={(e) => setEditTitle(e.target.value)}
        style={{ ...inputStyle, fontSize: '14px', fontWeight: 500 }}
      />

      <textarea
        value={editDesc}
        onChange={(e) => setEditDesc(e.target.value)}
        rows={5}
        placeholder="Description..."
        style={textareaStyle}
      />

      <div>
        <label
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            display: 'block',
            marginBottom: '6px',
          }}
        >
          PRIORITY
        </label>
        <div style={{ display: 'flex', gap: '6px' }}>
          {TASK_PRIORITIES.map((p) => (
            <button
              key={p}
              onClick={() => setEditPriority(p)}
              style={priorityToggleStyle(editPriority === p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
        <div>
          Status:{' '}
          <span style={{ color: 'var(--text-secondary)' }}>{task.status.replace('_', ' ')}</span>
        </div>
        <div>
          Created:{' '}
          <span style={{ color: 'var(--text-secondary)' }}>
            {new Date(task.createdAt).toLocaleString()}
          </span>
        </div>
        {task.sessionId && (
          <div>
            Session:{' '}
            <span style={{ color: 'var(--text-secondary)' }}>{task.sessionId.slice(0, 12)}</span>
          </div>
        )}
        {task.completedAt && (
          <div>
            Completed:{' '}
            <span style={{ color: 'var(--text-secondary)' }}>
              {new Date(task.completedAt).toLocaleString()}
            </span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
        <button onClick={handleDelete} style={buttonDanger}>
          Delete
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={() => selectTask(null)} style={buttonGhost}>
          Cancel
        </button>
        <button onClick={handleSave} style={buttonPrimary}>
          Save
        </button>
      </div>
    </div>
  );
}
