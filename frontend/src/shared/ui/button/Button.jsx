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
    color: 'var(--text-primary)',
    border: '1px solid transparent',
  },
  subtle: {
    backgroundColor: 'var(--bg-surface-1)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-subtle)',
  },
  danger: {
    backgroundColor: 'var(--status-danger)',
    color: 'var(--text-inverse)',
    border: '1px solid transparent',
  },
}

const SIZE_STYLES = {
  sm: {
    minHeight: '2rem',
    padding: '0 var(--space-3)',
    fontSize: 'var(--text-sm)',
  },
  md: {
    minHeight: '2.5rem',
    padding: '0 var(--space-4)',
    fontSize: 'var(--text-sm)',
  },
  lg: {
    minHeight: '3rem',
    padding: '0 var(--space-5)',
    fontSize: 'var(--text-md)',
  },
}

export function Button({
  variant = 'primary',
  size = 'md',
  leadingIcon = null,
  trailingIcon = null,
  loading = false,
  disabled = false,
  block = false,
  className,
  style,
  children,
  type = 'button',
  ...props
}) {
  const isDisabled = disabled || loading

  return (
    <button
      type={type}
      disabled={isDisabled}
      className={cn(
        'kence-btn',
        'inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-medium transition-all',
        focusRing,
        block && 'w-full',
        isDisabled && 'cursor-not-allowed opacity-60',
        className
      )}
      style={{
        ...SIZE_STYLES[size],
        ...VARIANT_STYLES[variant],
        boxShadow: variant === 'ghost' ? 'none' : 'var(--shadow-xs)',
        width: block ? '100%' : undefined,
        ...style,
      }}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span aria-hidden="true">...</span> : leadingIcon}
      {children ? <span className="truncate">{children}</span> : null}
      {!loading ? trailingIcon : null}
    </button>
  )
}
