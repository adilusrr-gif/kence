import React from 'react'
import { cn } from '@/shared/lib/cn'

const VARIANT_STYLES = {
  neutral: {
    backgroundColor: 'var(--bg-surface-2)',
    color: 'var(--text-secondary)',
    borderColor: 'var(--border-subtle)',
  },
  accent: {
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
    color: 'var(--accent-primary)',
    borderColor: 'rgba(34, 211, 238, 0.2)',
  },
  success: {
    backgroundColor: 'rgba(74, 222, 128, 0.12)',
    color: 'var(--status-success)',
    borderColor: 'rgba(74, 222, 128, 0.2)',
  },
  warning: {
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    color: 'var(--status-warning)',
    borderColor: 'rgba(251, 191, 36, 0.2)',
  },
  danger: {
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    color: 'var(--status-danger)',
    borderColor: 'rgba(248, 113, 113, 0.2)',
  },
  info: {
    backgroundColor: 'rgba(96, 165, 250, 0.12)',
    color: 'var(--status-info)',
    borderColor: 'rgba(96, 165, 250, 0.2)',
  },
}

const SIZE_STYLES = {
  sm: { fontSize: 'var(--text-xs)', padding: '0 var(--space-2)', minHeight: '1.25rem' },
  md: { fontSize: 'var(--text-xs)', padding: '0 var(--space-3)', minHeight: '1.5rem' },
}

export function Badge({
  variant = 'neutral',
  size = 'md',
  className,
  style,
  children,
  ...props
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[var(--radius-pill)] border font-medium',
        className
      )}
      style={{
        ...VARIANT_STYLES[variant],
        ...SIZE_STYLES[size],
        ...style,
      }}
      {...props}
    >
      {children}
    </span>
  )
}
