import React from 'react'
import { cn } from '@/shared/lib/cn'

export function ScrollArea({
  orientation = 'vertical',
  maxHeight,
  className,
  style,
  children,
  ...props
}) {
  const isHorizontal = orientation === 'horizontal'
  const isBoth = orientation === 'both'

  return (
    <div
      className={cn('min-w-0', className)}
      style={{
        overflowX: isHorizontal || isBoth ? 'auto' : 'hidden',
        overflowY: !isHorizontal || isBoth ? 'auto' : 'hidden',
        maxHeight,
        scrollbarColor: 'var(--border-default) transparent',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  )
}
