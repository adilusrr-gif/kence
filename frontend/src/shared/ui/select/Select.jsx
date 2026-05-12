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

export function Select({
  options = [],
  placeholder,
  size = 'md',
  state = 'default',
  disabled = false,
  className,
  style,
  ...props
}) {
  return (
    <select
      disabled={disabled}
      className={cn(
        'w-full rounded-[var(--radius-md)] border outline-none transition-all',
        focusRing,
        disabled && 'cursor-not-allowed opacity-60',
        className
      )}
      style={{
        backgroundColor: 'var(--bg-surface-1)',
        color: 'var(--text-primary)',
        ...SIZE_STYLES[size],
        ...STATE_STYLES[state],
        ...style,
      }}
      {...props}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map(option => {
        const normalized = typeof option === 'string'
          ? { label: option, value: option }
          : option

        return (
          <option key={normalized.value} value={normalized.value}>
            {normalized.label}
          </option>
        )
      })}
    </select>
  )
}
