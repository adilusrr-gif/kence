import React from 'react'
import { cn } from '@/shared/lib/cn'
import { TEXT_STYLES } from '@/shared/ui/_internal/textStyles'
import { Inline } from '@/shared/ui/inline'
import { Stack } from '@/shared/ui/stack'

const DENSITY_STYLES = {
  compact: {
    titleSize: 'var(--text-sm)',
    subtitleSize: 'var(--text-xs)',
    gap: 'sm',
  },
  comfortable: {
    titleSize: 'var(--text-md)',
    subtitleSize: 'var(--text-sm)',
    gap: 'md',
  },
}

export function SectionHeader({
  title,
  subtitle = null,
  actions = null,
  dense = false,
  className,
  style,
  ...props
}) {
  const density = dense ? DENSITY_STYLES.compact : DENSITY_STYLES.comfortable

  return (
    <Inline
      align="flex-start"
      justify="space-between"
      gap={density.gap}
      className={cn('w-full min-w-0', className)}
      style={style}
      {...props}
    >
      <Stack gap="xs" className="min-w-0 flex-1">
        {title ? (
          <div
            style={{
              ...(dense ? TEXT_STYLES.titleSm : TEXT_STYLES.titleMd),
              fontSize: density.titleSize,
            }}
          >
            {title}
          </div>
        ) : null}
        {subtitle ? (
          <div
            style={{
              ...TEXT_STYLES.bodySm,
              fontSize: density.subtitleSize,
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </Stack>

      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </Inline>
  )
}
