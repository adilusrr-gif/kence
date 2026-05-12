import React from 'react'
import { cn } from '@/shared/lib/cn'
import { TEXT_STYLES } from '@/shared/ui/_internal/textStyles'
import { Surface } from '@/shared/ui/surface'

export function Panel({
  title,
  subtitle,
  headerActions = null,
  footer = null,
  children,
  className,
  bodyClassName,
  headerClassName,
  footerClassName,
  level = 1,
  glass = false,
  density = 'comfortable',
  padding = 'md',
  scrollable = false,
  ...props
}) {
  const hasHeader = title || subtitle || headerActions
  const bodyPadding = density === 'compact' ? 'var(--space-3)' : 'var(--space-4)'

  return (
    <Surface
      level={level}
      glass={glass}
      density={density}
      padding="none"
      className={cn('overflow-hidden', className)}
      {...props}
    >
      {hasHeader && (
        <div
          className={cn('flex items-start justify-between gap-3', headerClassName)}
          style={{
            padding: padding === 'none' ? '0' : bodyPadding,
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div className="min-w-0 flex-1">
            {title && (
              <div style={TEXT_STYLES.titleMd}>
                {title}
              </div>
            )}
            {subtitle && (
              <div
                style={{
                  ...TEXT_STYLES.bodySm,
                  marginTop: 'var(--space-1)',
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
          {headerActions ? <div className="flex shrink-0 items-center gap-2">{headerActions}</div> : null}
        </div>
      )}

      <div
        className={cn('min-w-0', scrollable && 'overflow-auto', bodyClassName)}
        style={{
          padding: padding === 'none' ? '0' : bodyPadding,
          flex: 1,
        }}
      >
        {children}
      </div>

      {footer ? (
        <div
          className={cn(footerClassName)}
          style={{
            padding: padding === 'none' ? '0' : bodyPadding,
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          {footer}
        </div>
      ) : null}
    </Surface>
  )
}
