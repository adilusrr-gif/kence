import React from 'react'
import { cn } from '@/shared/lib/cn'
import { Surface } from '@/shared/ui/surface'

const TONE_STYLES = {
  default: {
    backgroundColor: 'var(--bg-surface-1)',
    borderColor: 'var(--border-subtle)',
  },
  muted: {
    backgroundColor: 'var(--bg-surface-2)',
    borderColor: 'var(--border-default)',
  },
  accent: {
    backgroundColor: 'color-mix(in srgb, var(--accent-primary) 12%, var(--bg-surface-1))',
    borderColor: 'color-mix(in srgb, var(--accent-primary) 34%, transparent)',
  },
}

export function Card({
  as: Component = 'div',
  tone = 'default',
  interactive = false,
  className,
  style,
  children,
  ...props
}) {
  return (
    <Surface
      as={Component}
      level={1}
      padding="md"
      className={cn(
        'min-w-0',
        interactive && 'cursor-pointer',
        className
      )}
      style={{
        ...TONE_STYLES[tone],
        ...(interactive
          ? {
              transition:
                'transform var(--duration-base) var(--ease-standard), box-shadow var(--duration-base) var(--ease-standard), border-color var(--duration-base) var(--ease-standard)',
            }
          : null),
        ...style,
      }}
      {...props}
    >
      {children}
    </Surface>
  )
}
