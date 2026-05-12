import React from 'react'
import { cn } from '@/shared/lib/cn'

const SIZE_STYLES = {
  sm: '0.875rem',
  md: '1rem',
  lg: '1.25rem',
}

const TONE_STYLES = {
  default: 'var(--text-secondary)',
  accent: 'var(--accent-primary)',
  inverse: 'var(--text-inverse)',
}

export function Loader({
  size = 'md',
  tone = 'default',
  label,
  className,
  style,
  ...props
}) {
  const dimension = SIZE_STYLES[size] || SIZE_STYLES.md
  const color = TONE_STYLES[tone] || TONE_STYLES.default

  return (
    <span
      className={cn('inline-flex items-center justify-center', className)}
      aria-label={label}
      role={label ? 'status' : undefined}
      style={style}
      {...props}
    >
      <span
        aria-hidden="true"
        style={{
          width: dimension,
          height: dimension,
          borderRadius: 'var(--radius-pill)',
          border: `2px solid color-mix(in srgb, ${color} 24%, transparent)`,
          borderTopColor: color,
          animation: 'spin 0.8s linear infinite',
          display: 'inline-block',
        }}
      />
    </span>
  )
}
