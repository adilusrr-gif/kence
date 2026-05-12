import React from 'react'
import { cn } from '@/shared/lib/cn'
import { focusRing } from '@/shared/lib/a11y/focusRing'

const STATE_STYLES = {
  default: { borderColor: 'var(--border-default)' },
  error: { borderColor: 'var(--status-danger)' },
  success: { borderColor: 'var(--status-success)' },
}

export function Textarea({
  state = 'default',
  resize = 'vertical',
  disabled = false,
  className,
  style,
  ...props
}) {
  return (
    <textarea
      disabled={disabled}
      className={cn(
        'w-full rounded-[var(--radius-md)] border bg-transparent px-[var(--space-4)] py-[var(--space-3)] outline-none transition-all',
        focusRing,
        disabled && 'cursor-not-allowed opacity-60',
        className
      )}
      style={{
        backgroundColor: 'var(--bg-surface-1)',
        color: 'var(--text-primary)',
        fontSize: 'var(--text-sm)',
        lineHeight: 'var(--leading-normal)',
        resize: resize === 'none' ? 'none' : 'vertical',
        ...STATE_STYLES[state],
        ...style,
      }}
      {...props}
    />
  )
}
