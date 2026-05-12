import React from 'react'
import { cn } from '@/shared/lib/cn'

const LEVEL_STYLES = {
  canvas: {
    backgroundColor: 'var(--bg-canvas)',
    color: 'var(--text-primary)',
    border: '1px solid transparent',
    boxShadow: 'none',
  },
  1: {
    backgroundColor: 'var(--bg-surface-1)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle)',
    boxShadow: 'var(--shadow-xs)',
  },
  2: {
    backgroundColor: 'var(--bg-surface-2)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-default)',
    boxShadow: 'var(--shadow-sm)',
  },
  3: {
    backgroundColor: 'var(--bg-surface-3)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-strong)',
    boxShadow: 'var(--shadow-md)',
  },
  overlay: {
    backgroundColor: 'var(--bg-overlay)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-default)',
    boxShadow: 'var(--shadow-lg)',
  },
}

const GLASS_STYLES = {
  subtle: {
    backgroundColor: 'var(--glass-bg)',
    border: '1px solid var(--glass-border)',
    boxShadow: 'var(--shadow-sm)',
    backdropFilter: 'blur(var(--glass-blur))',
    WebkitBackdropFilter: 'blur(var(--glass-blur))',
  },
  panel: {
    backgroundColor: 'var(--glass-bg-strong)',
    border: '1px solid var(--glass-border)',
    boxShadow: 'var(--glass-shadow)',
    backdropFilter: 'blur(var(--glass-blur))',
    WebkitBackdropFilter: 'blur(var(--glass-blur))',
  },
  modal: {
    backgroundColor: 'var(--glass-bg-strong)',
    border: '1px solid var(--glass-border)',
    boxShadow: 'var(--shadow-lg)',
    backdropFilter: 'blur(var(--glass-blur))',
    WebkitBackdropFilter: 'blur(var(--glass-blur))',
  },
}

const PADDING_STYLES = {
  none: '0',
  xs: 'var(--space-2)',
  sm: 'var(--space-3)',
  md: 'var(--space-4)',
  lg: 'var(--space-6)',
  xl: 'var(--space-8)',
}

const DENSITY_STYLES = {
  compact: {
    gap: 'var(--space-2)',
  },
  comfortable: {
    gap: 'var(--space-3)',
  },
}

export function Surface({
  as: Component = 'div',
  level = 1,
  glass = false,
  padding = 'md',
  radius = 'lg',
  density = 'comfortable',
  bordered = true,
  elevated = false,
  responsive = true,
  style,
  className,
  children,
  ...props
}) {
  const baseStyle = LEVEL_STYLES[level] || LEVEL_STYLES[1]
  const glassStyle = glass ? GLASS_STYLES[glass] || GLASS_STYLES.subtle : null
  const mergedStyle = {
    ...baseStyle,
    ...(glassStyle || {}),
    ...(DENSITY_STYLES[density] || DENSITY_STYLES.comfortable),
    padding: PADDING_STYLES[padding] || PADDING_STYLES.md,
    borderRadius: `var(--radius-${radius}, var(--radius-lg))`,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    ...(bordered ? null : { border: '1px solid transparent' }),
    ...(elevated ? { boxShadow: 'var(--shadow-md)' } : null),
    ...style,
  }

  return (
    <Component
      className={cn(
        'min-w-0',
        responsive && 'w-full',
        className
      )}
      style={mergedStyle}
      {...props}
    >
      {children}
    </Component>
  )
}
