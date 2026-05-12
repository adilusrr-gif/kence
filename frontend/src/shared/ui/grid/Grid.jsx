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

export function Grid({
  as: Component = 'div',
  columns = 1,
  gap = 'md',
  minItemWidth = null,
  responsive = true,
  className,
  style,
  children,
  ...props
}) {
  const templateColumns = minItemWidth
    ? `repeat(auto-fit, minmax(${minItemWidth}, 1fr))`
    : typeof columns === 'number'
    ? `repeat(${columns}, minmax(0, 1fr))`
    : columns

  return (
    <Component
      className={cn('grid', responsive && 'min-w-0', className)}
      style={{
        gridTemplateColumns: templateColumns,
        gap: GAP_MAP[gap] || GAP_MAP.md,
        ...style,
      }}
      {...props}
    >
      {children}
    </Component>
  )
}
