import React from 'react'
import { cn } from '@/shared/lib/cn'
import { Divider } from '@/shared/ui/divider'
import { Inline } from '@/shared/ui/inline'
import { Panel } from '@/shared/ui/panel'
import { Progress } from '@/shared/ui/progress'
import { Stack } from '@/shared/ui/stack'
import { StatusPill } from '@/shared/ui/status-pill'

export function StatusSection({
  title,
  subtitle = null,
  headerActions = null,
  items = [],
  progress = null,
  footer = null,
  className,
  style,
  children,
  ...props
}) {
  const normalizedItems = Array.isArray(items) ? items.filter(Boolean) : []

  return (
    <Panel
      title={title}
      subtitle={subtitle}
      headerActions={headerActions}
      className={className}
      style={style}
      {...props}
    >
      <Stack gap="md">
        {normalizedItems.length ? (
          <Inline gap="sm" wrap>
            {normalizedItems.map(item => (
              <StatusPill
                key={`${item.label}-${item.status || 'idle'}`}
                status={item.status}
                label={item.label}
                pulse={item.pulse}
                icon={item.icon}
              />
            ))}
          </Inline>
        ) : null}

        {progress ? (
          <Stack gap="xs">
            {progress.label ? (
              <Inline justify="space-between" align="center" gap="sm">
                <div
                  style={{
                    color: 'var(--text-secondary)',
                    fontSize: 'var(--text-xs)',
                    lineHeight: 'var(--leading-normal)',
                  }}
                >
                  {progress.label}
                </div>
                {progress.valueLabel ? (
                  <div
                    style={{
                      color: 'var(--text-tertiary)',
                      fontSize: 'var(--text-xs)',
                      lineHeight: 'var(--leading-normal)',
                    }}
                  >
                    {progress.valueLabel}
                  </div>
                ) : null}
              </Inline>
            ) : null}
            <Progress
              value={progress.value}
              max={progress.max}
              variant={progress.variant}
            />
          </Stack>
        ) : null}

        {children}

        {footer ? (
          <>
            <Divider />
            <div className={cn('min-w-0')}>{footer}</div>
          </>
        ) : null}
      </Stack>
    </Panel>
  )
}
