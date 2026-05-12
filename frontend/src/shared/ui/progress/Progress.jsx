import React from 'react'
import { cn } from '@/shared/lib/cn'

const VARIANT_STYLES = {
  default: 'var(--accent-primary)',
  success: 'var(--status-success)',
  warning: 'var(--status-warning)',
  danger: 'var(--status-danger)',
}

export function Progress({
  value = 0,
  max = 100,
  variant = 'default',
  className,
  style,
  ...props
}) {
  const safeMax = max > 0 ? max : 100
  const normalized = Math.max(0, Math.min(100, (value / safeMax) * 100))

  return (
    <div
      className={cn('w-full overflow-hidden rounded-[var(--radius-pill)]', className)}
      style={{
        backgroundColor: 'var(--bg-surface-2)',
        height: '0.5rem',
        ...style,
      }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={value}
      {...props}
    >
      <div
        style={{
          width: `${normalized}%`,
          height: '100%',
          backgroundColor: VARIANT_STYLES[variant] || VARIANT_STYLES.default,
          transition: 'width var(--duration-base) var(--ease-standard)',
        }}
      />
    </div>
  )
}
