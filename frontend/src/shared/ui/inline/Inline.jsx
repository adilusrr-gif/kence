import React from 'react'
import { cn } from '@/shared/lib/cn'

const GAP_MAP = {
  none: '0',
  xs: 'var(--space-1)',
  sm: 'var(--space-2)',
  md: 'var(--space-3)',
  lg: 'var(--space-4)',
  xl: 'var(--space-6)',
}

export function Inline({
  as: Component = 'div',
  gap = 'md',
  align = 'center',
  justify = 'flex-start',
  wrap = false,
  responsive = true,
  className,
  style,
  children,
  ...props
}) {
  return (
    <Component
      className={cn('flex flex-row', responsive && 'min-w-0', className)}
      style={{
        gap: GAP_MAP[gap] || GAP_MAP.md,
        alignItems: align,
        justifyContent: justify,
        flexWrap: wrap ? 'wrap' : 'nowrap',
        ...style,
      }}
      {...props}
    >
      {children}
    </Component>
  )
}
