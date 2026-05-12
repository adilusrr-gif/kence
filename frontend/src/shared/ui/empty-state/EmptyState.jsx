import React from 'react'
import { cn } from '@/shared/lib/cn'
import { TEXT_STYLES } from '@/shared/ui/_internal/textStyles'
import { ActionGroup } from '@/shared/ui/action-group'
import { Stack } from '@/shared/ui/stack'

const SIZE_STYLES = {
  sm: {
    padding: 'var(--space-4)',
    titleSize: 'var(--text-md)',
    descriptionSize: 'var(--text-sm)',
    iconSize: '1.5rem',
  },
  md: {
    padding: 'var(--space-6)',
    titleSize: 'var(--text-lg)',
    descriptionSize: 'var(--text-sm)',
    iconSize: '2rem',
  },
  lg: {
    padding: 'var(--space-8)',
    titleSize: 'var(--text-xl)',
    descriptionSize: 'var(--text-md)',
    iconSize: '2.5rem',
  },
}

export function EmptyState({
  icon = null,
  title,
  description = null,
  actions = null,
  align = 'center',
  size = 'md',
  className,
  style,
  children,
  ...props
}) {
  const currentSize = SIZE_STYLES[size] || SIZE_STYLES.md

  return (
    <Stack
      gap="md"
      align={align === 'center' ? 'center' : 'flex-start'}
      className={cn('w-full rounded-[var(--radius-xl)] border', className)}
      style={{
        padding: currentSize.padding,
        backgroundColor: 'var(--bg-surface-1)',
        borderColor: 'var(--border-subtle)',
        textAlign: align,
        ...style,
      }}
      {...props}
    >
      {icon ? (
        <div
          aria-hidden="true"
          style={{
            fontSize: currentSize.iconSize,
            color: 'var(--text-tertiary)',
            lineHeight: 1,
          }}
        >
          {icon}
        </div>
      ) : null}

      {title ? (
        <div
          style={{
            ...TEXT_STYLES.titleLg,
            fontSize: currentSize.titleSize,
          }}
        >
          {title}
        </div>
      ) : null}

      {description ? (
        <div
          style={{
            ...TEXT_STYLES.bodySm,
            fontSize: currentSize.descriptionSize,
            maxWidth: '42rem',
          }}
        >
          {description}
        </div>
      ) : null}

      {actions ? <ActionGroup align={align === 'center' ? 'center' : 'start'} fullWidth={false}>{actions}</ActionGroup> : null}
      {children}
    </Stack>
  )
}
