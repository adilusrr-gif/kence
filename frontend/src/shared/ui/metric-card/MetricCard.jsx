import React from 'react'
import { cn } from '@/shared/lib/cn'
import { TEXT_STYLES } from '@/shared/ui/_internal/textStyles'
import { Badge } from '@/shared/ui/badge'
import { Card } from '@/shared/ui/card'
import { Inline } from '@/shared/ui/inline'
import { Stack } from '@/shared/ui/stack'

export function MetricCard({
  label,
  value,
  delta = null,
  icon = null,
  support = null,
  accent = false,
  className,
  style,
  children,
  ...props
}) {
  return (
    <Card
      tone={accent ? 'accent' : 'default'}
      className={cn('min-w-0', className)}
      style={style}
      {...props}
    >
      <Stack gap="md">
        <Inline justify="space-between" align="flex-start" gap="md">
          <Stack gap="xs" className="min-w-0 flex-1">
            {label ? (
              <div style={TEXT_STYLES.bodyXs}>
                {label}
              </div>
            ) : null}
            {value ? (
              <div style={TEXT_STYLES.metricValue}>
                {value}
              </div>
            ) : null}
          </Stack>

          {icon ? (
            <div
              aria-hidden="true"
              style={{
                color: 'var(--text-tertiary)',
                fontSize: '1.125rem',
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              {icon}
            </div>
          ) : null}
        </Inline>

        {(delta || support || children) ? (
          <Stack gap="sm">
            {delta ? (
              typeof delta === 'string'
                ? <Badge variant="neutral" size="sm" style={{ alignSelf: 'flex-start' }}>{delta}</Badge>
                : delta
            ) : null}
            {support ? (
              <div style={TEXT_STYLES.bodySm}>
                {support}
              </div>
            ) : null}
            {children}
          </Stack>
        ) : null}
      </Stack>
    </Card>
  )
}
