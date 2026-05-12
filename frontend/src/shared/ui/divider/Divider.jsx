import React from 'react'
import { cn } from '@/shared/lib/cn'

export function Divider({
  orientation = 'horizontal',
  tone = 'subtle',
  inset = false,
  className,
  style,
  ...props
}) {
  const borderColor =
    tone === 'strong' ? 'var(--border-strong)' :
    tone === 'default' ? 'var(--border-default)' :
    'var(--border-subtle)'

  const isVertical = orientation === 'vertical'

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn('shrink-0', className)}
      style={{
        ...(isVertical
          ? {
              width: '1px',
              alignSelf: 'stretch',
              backgroundColor: borderColor,
              marginBlock: inset ? 'var(--space-2)' : 0,
            }
          : {
              height: '1px',
              width: '100%',
              backgroundColor: borderColor,
              marginInline: inset ? 'var(--space-2)' : 0,
            }),
        ...style,
      }}
      {...props}
    />
  )
}
