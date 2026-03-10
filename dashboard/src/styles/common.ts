import type { CSSProperties } from 'react';
import type { TaskPriority } from '@neo-agent/shared';

export const TASK_PRIORITIES: readonly TaskPriority[] = ['low', 'medium', 'high', 'critical'];

export const inputStyle: CSSProperties = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text-white)',
  padding: '8px 10px',
  fontSize: '13px',
  fontFamily: 'var(--font-mono)',
  outline: 'none',
};

export const textareaStyle: CSSProperties = {
  ...inputStyle,
  resize: 'vertical',
};

export const buttonBase: CSSProperties = {
  borderRadius: 'var(--radius)',
  padding: '6px 14px',
  fontSize: '12px',
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
};

export const buttonGhost: CSSProperties = {
  ...buttonBase,
  background: 'transparent',
  border: '1px solid var(--border)',
  color: 'var(--text-muted)',
};

export const buttonPrimary: CSSProperties = {
  ...buttonBase,
  background: 'var(--accent-dim)',
  border: '1px solid var(--text-primary)',
  color: 'var(--text-primary)',
  fontWeight: 600,
};

export const buttonDanger: CSSProperties = {
  ...buttonBase,
  background: 'transparent',
  border: '1px solid #ff333360',
  color: '#ff3333',
};

export function priorityToggleStyle(isActive: boolean): CSSProperties {
  return {
    background: isActive ? 'var(--accent-dim)' : 'transparent',
    border: `1px solid ${isActive ? 'var(--text-primary)' : 'var(--border)'}`,
    color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
    borderRadius: 'var(--radius)',
    padding: '3px 8px',
    fontSize: '11px',
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    textTransform: 'uppercase',
  };
}
