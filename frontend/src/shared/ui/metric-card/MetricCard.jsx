import React from 'react'
import { cn } from '@/shared/lib/cn'
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
              <div
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: 'var(--text-xs)',
                  lineHeight: 'var(--leading-normal)',
                }}
              >
                {label}
              </div>
            ) : null}
            {value ? (
              <div
                style={{
                  color: 'var(--text-primary)',
                  fontSize: 'clamp(1.5rem, 2vw, 2rem)',
                  fontWeight: 700,
                  lineHeight: 1,
                }}
              >
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
              <div
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: 'var(--text-sm)',
                  lineHeight: 'var(--leading-normal)',
                }}
              >
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
