import React from 'react'
import { cn } from '@/shared/lib/cn'
import { focusRing } from '@/shared/lib/a11y/focusRing'

const VARIANT_STYLES = {
  primary: {
    backgroundColor: 'var(--accent-primary)',
    color: 'var(--text-inverse)',
    border: '1px solid transparent',
  },
  secondary: {
    backgroundColor: 'var(--bg-surface-2)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-default)',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid transparent',
  },
  subtle: {
    backgroundColor: 'var(--bg-surface-1)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-subtle)',
  },
}

const SIZE_STYLES = {
  sm: { width: '2rem', height: '2rem' },
  md: { width: '2.5rem', height: '2.5rem' },
  lg: { width: '3rem', height: '3rem' },
}

export function IconButton({
  label,
  variant = 'secondary',
  size = 'md',
  active = false,
  disabled = false,
  loading = false,
  className,
  style,
  children,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      aria-label={label}
      aria-pressed={active || undefined}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-[var(--radius-md)] transition-all',
        focusRing,
        (disabled || loading) && 'cursor-not-allowed opacity-60',
        className
      )}
      style={{
        ...SIZE_STYLES[size],
        ...VARIANT_STYLES[variant],
        ...(active ? { boxShadow: 'var(--shadow-focus)' } : null),
        ...style,
      }}
      {...props}
    >
      {loading ? <span aria-hidden="true">...</span> : children}
    </button>
  )
}
