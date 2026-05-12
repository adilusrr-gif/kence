import React from 'react'
import { cn } from '@/shared/lib/cn'
import { GAP_MAP } from '@/shared/ui/_internal/layout'

export function Stack({
  as: Component = 'div',
  gap = 'md',
  align = 'stretch',
  justify = 'flex-start',
  responsive = true,
  className,
  style,
  children,
  ...props
}) {
  return (
    <Component
      className={cn('flex flex-col', responsive && 'min-w-0', className)}
      style={{
        gap: GAP_MAP[gap] || GAP_MAP.md,
        alignItems: align,
        justifyContent: justify,
        ...style,
      }}
      {...props}
    >
      {children}
    </Component>
  )
}
