import React from 'react'
import { cn } from '@/shared/lib/cn'
import { GAP_MAP } from '@/shared/ui/_internal/layout'

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
