import React from 'react'
import { cn } from '@/shared/lib/cn'
import { TEXT_STYLES } from '@/shared/ui/_internal/textStyles'
import { Badge } from '@/shared/ui/badge'
import { Card } from '@/shared/ui/card'
import { Divider } from '@/shared/ui/divider'
import { Inline } from '@/shared/ui/inline'
import { SectionHeader } from '@/shared/ui/section-header'
import { Stack } from '@/shared/ui/stack'

export function InfoPanel({
  title,
  subtitle = null,
  eyebrow = null,
  badge = null,
  actions = null,
  footer = null,
  tone = 'default',
  className,
  style,
  children,
  ...props
}) {
  return (
    <Card tone={tone} className={cn('min-w-0', className)} style={style} {...props}>
      <Stack gap="md">
        {(eyebrow || title || subtitle || badge || actions) ? (
          <Stack gap="sm">
            {eyebrow ? (
              <Badge variant="neutral" size="sm" style={{ alignSelf: 'flex-start' }}>
                {eyebrow}
              </Badge>
            ) : null}
            <SectionHeader
              title={title}
              subtitle={subtitle}
              actions={
                <Inline gap="sm" wrap>
                  {badge}
                  {actions}
                </Inline>
              }
            />
          </Stack>
        ) : null}

        {children ? <Stack gap="sm">{children}</Stack> : null}

        {footer ? (
          <>
            <Divider />
            {footer}
          </>
        ) : null}
      </Stack>
    </Card>
  )
}

export function InfoPanelList({ className, style, children, ...props }) {
  return (
    <Stack gap="sm" className={className} style={style} {...props}>
      {children}
    </Stack>
  )
}

export function InfoPanelItem({
  label,
  value,
  support = null,
  align = 'start',
  className,
  style,
  children,
  ...props
}) {
  const justifyContent = align === 'between' ? 'space-between' : 'flex-start'
  const alignItems = align === 'between' ? 'center' : 'flex-start'

  return (
    <Inline
      justify={justifyContent}
      align={alignItems}
      gap="md"
      wrap={align !== 'between'}
      className={cn('min-w-0', className)}
      style={style}
      {...props}
    >
      <Stack gap="xs" className="min-w-0 flex-1">
        {label ? (
          <div style={TEXT_STYLES.bodyXs}>
            {label}
          </div>
        ) : null}
        {value ? (
          <div style={TEXT_STYLES.titleSm}>
            {value}
          </div>
        ) : null}
        {support ? (
          <div style={TEXT_STYLES.supportXs}>
            {support}
          </div>
        ) : null}
      </Stack>
      {children}
    </Inline>
  )
}

InfoPanel.List = InfoPanelList
InfoPanel.Item = InfoPanelItem
