import React from 'react'
import { cn } from '@/shared/lib/cn'

const STATUS_COLOR = {
  idle: 'var(--text-tertiary)',
  active: 'var(--accent-primary)',
  success: 'var(--status-success)',
  warning: 'var(--status-warning)',
  error: 'var(--status-danger)',
  streaming: 'var(--status-info)',
}

export function StatusPill({
  status = 'idle',
  label,
  pulse = false,
  icon = null,
  className,
  style,
  ...props
}) {
  const color = STATUS_COLOR[status] || STATUS_COLOR.idle

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-[var(--radius-pill)] border px-[var(--space-3)] py-[var(--space-1)] text-[var(--text-xs)] font-medium',
        className
      )}
      style={{
        color,
        borderColor: 'var(--border-subtle)',
        backgroundColor: 'var(--bg-surface-1)',
        ...style,
      }}
      {...props}
    >
      <span
        aria-hidden="true"
        style={{
          width: '0.5rem',
          height: '0.5rem',
          borderRadius: 'var(--radius-pill)',
          backgroundColor: color,
          opacity: pulse ? 0.9 : 0.75,
        }}
      />
      {icon}
      <span>{label}</span>
    </span>
  )
}
