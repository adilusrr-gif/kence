import React from 'react'
import { cn } from '@/shared/lib/cn'
import { Inline } from '@/shared/ui/inline'

const ALIGNMENT_STYLES = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
}

export function ActionGroup({
  align = 'start',
  wrap = true,
  gap = 'sm',
  stretch = false,
  className,
  style,
  children,
  ...props
}) {
  return (
    <Inline
      gap={gap}
      wrap={wrap}
      className={cn(stretch && '[&>*]:flex-1', className)}
      style={{
        justifyContent: ALIGNMENT_STYLES[align] || ALIGNMENT_STYLES.start,
        width: '100%',
        ...style,
      }}
      {...props}
    >
      {children}
    </Inline>
  )
}
