import React from 'react'
import { cn } from '@/shared/lib/cn'
import { focusRing } from '@/shared/lib/a11y/focusRing'

const SIZE_STYLES = {
  sm: { minHeight: '2rem', fontSize: 'var(--text-sm)', padding: '0 var(--space-3)' },
  md: { minHeight: '2.5rem', fontSize: 'var(--text-sm)', padding: '0 var(--space-4)' },
  lg: { minHeight: '3rem', fontSize: 'var(--text-md)', padding: '0 var(--space-5)' },
}

const STATE_STYLES = {
  default: { borderColor: 'var(--border-default)' },
  error: { borderColor: 'var(--status-danger)' },
  success: { borderColor: 'var(--status-success)' },
}

export function Input({
  size = 'md',
  state = 'default',
  leadingIcon = null,
  trailingIcon = null,
  disabled = false,
  className,
  style,
  ...props
}) {
  return (
    <div
      className={cn(
        'flex w-full min-w-0 items-center gap-2 rounded-[var(--radius-md)] border bg-transparent',
        focusRing,
        disabled && 'opacity-60',
        className
      )}
      style={{
        backgroundColor: 'var(--bg-surface-1)',
        ...STATE_STYLES[state],
        ...SIZE_STYLES[size],
        ...style,
      }}
    >
      {leadingIcon ? <span style={{ color: 'var(--text-tertiary)' }}>{leadingIcon}</span> : null}
      <input
        disabled={disabled}
        className="w-full min-w-0 bg-transparent outline-none"
        style={{
          color: 'var(--text-primary)',
          fontSize: 'inherit',
        }}
        {...props}
      />
      {trailingIcon ? <span style={{ color: 'var(--text-tertiary)' }}>{trailingIcon}</span> : null}
    </div>
  )
}
