import React from 'react'
import { TEXT_STYLES } from '@/shared/ui/_internal/textStyles'
import { Badge } from '@/shared/ui/badge'
import { EmptyState } from '@/shared/ui/empty-state'
import { Stack } from '@/shared/ui/stack'
import { ActionGroup } from '@/shared/ui/action-group'

export function IntelligenceEmpty({
  badge = null,
  icon = null,
  title,
  description = null,
  hints = [],
  actions = null,
  size = 'md',
  align = 'center',
  className,
  style,
  ...props
}) {
  const normalizedHints = Array.isArray(hints) ? hints.filter(Boolean) : []

  return (
    <EmptyState
      icon={icon}
      title={
        <Stack gap="sm" align={align === 'center' ? 'center' : 'flex-start'}>
          {badge ? (
            <Badge variant="neutral" size="sm" style={{ alignSelf: align === 'center' ? 'center' : 'flex-start' }}>
              {badge}
            </Badge>
          ) : null}
          <span>{title}</span>
        </Stack>
      }
      description={description}
      actions={actions ? <ActionGroup align={align === 'center' ? 'center' : 'start'}>{actions}</ActionGroup> : null}
      size={size}
      align={align}
      className={className}
      style={style}
      {...props}
    >
      {normalizedHints.length ? (
        <Stack
          gap="xs"
          align={align === 'center' ? 'center' : 'flex-start'}
          style={{ width: '100%' }}
        >
          {normalizedHints.map(hint => (
            <div
              key={hint}
              style={TEXT_STYLES.supportXs}
            >
              {hint}
            </div>
          ))}
        </Stack>
      ) : null}
    </EmptyState>
  )
}
