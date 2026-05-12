import React from 'react'
import { cn } from '@/shared/lib/cn'
import { Badge } from '@/shared/ui/badge'
import { Card } from '@/shared/ui/card'
import { Divider } from '@/shared/ui/divider'
import { Stack } from '@/shared/ui/stack'

export function UploadSurface({
  badge = null,
  title = null,
  description = null,
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
        {(badge || title || description) ? (
          <Stack gap="sm">
            {badge ? (
              <Badge variant="accent" size="sm" style={{ alignSelf: 'flex-start' }}>
                {badge}
              </Badge>
            ) : null}
            {title ? (
              <div
                style={{
                  color: 'var(--text-primary)',
                  fontSize: 'var(--text-lg)',
                  fontWeight: 600,
                  lineHeight: 'var(--leading-snug)',
                }}
              >
                {title}
              </div>
            ) : null}
            {description ? (
              <div
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: 'var(--text-sm)',
                  lineHeight: 'var(--leading-normal)',
                }}
              >
                {description}
              </div>
            ) : null}
          </Stack>
        ) : null}

        {children}

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

export function UploadSurfaceDropzone({
  active = false,
  occupied = false,
  className,
  style,
  children,
  ...props
}) {
  return (
    <Stack
      gap="sm"
      align="center"
      justify="center"
      className={cn('w-full rounded-[var(--radius-xl)] border border-dashed text-center', className)}
      style={{
        minHeight: '14rem',
        padding: 'var(--space-6)',
        backgroundColor: occupied
          ? 'color-mix(in srgb, var(--accent-primary) 8%, var(--bg-surface-1))'
          : 'var(--bg-surface-1)',
        borderColor: active
          ? 'color-mix(in srgb, var(--accent-primary) 50%, transparent)'
          : 'var(--border-default)',
        transform: active ? 'scale(1.01)' : 'scale(1)',
        transition:
          'transform var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard)',
        ...style,
      }}
      {...props}
    >
      {children}
    </Stack>
  )
}

export function UploadSurfaceMeta({ className, style, children, ...props }) {
  return (
    <Card
      tone="accent"
      className={cn('min-w-0', className)}
      style={{
        padding: 'var(--space-3)',
        ...style,
      }}
      {...props}
    >
      {children}
    </Card>
  )
}

UploadSurface.Dropzone = UploadSurfaceDropzone
UploadSurface.Meta = UploadSurfaceMeta
