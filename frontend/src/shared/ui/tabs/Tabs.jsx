import React from 'react'
import { cn } from '@/shared/lib/cn'
import { focusRing } from '@/shared/lib/a11y/focusRing'

const VARIANT_STYLES = {
  underline: {
    list: {
      borderBottom: '1px solid var(--border-subtle)',
    },
    getItemStyle: active => ({
      color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
      borderBottom: active ? '2px solid var(--accent-primary)' : '2px solid transparent',
      borderRadius: '0',
    }),
  },
  segmented: {
    list: {
      backgroundColor: 'var(--bg-surface-1)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-1)',
    },
    getItemStyle: active => ({
      color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
      backgroundColor: active ? 'var(--bg-surface-2)' : 'transparent',
      borderRadius: 'var(--radius-md)',
    }),
  },
  pills: {
    list: {},
    getItemStyle: active => ({
      color: active ? 'var(--text-inverse)' : 'var(--text-secondary)',
      backgroundColor: active ? 'var(--accent-primary)' : 'var(--bg-surface-1)',
      border: `1px solid ${active ? 'transparent' : 'var(--border-subtle)'}`,
      borderRadius: 'var(--radius-pill)',
    }),
  },
}

export function Tabs({
  items = [],
  value,
  onValueChange,
  variant = 'underline',
  className,
  listClassName,
  ...props
}) {
  const currentVariant = VARIANT_STYLES[variant] || VARIANT_STYLES.underline

  return (
    <div className={cn('min-w-0', className)} {...props}>
      <div
        role="tablist"
        className={cn('flex min-w-0 items-center gap-2', listClassName)}
        style={currentVariant.list}
      >
        {items.map(item => {
          const active = item.value === value

          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={active}
              className={cn(
                'inline-flex min-w-0 items-center justify-center px-[var(--space-3)] py-[var(--space-2)] text-left text-[var(--text-sm)] font-medium transition-all',
                focusRing
              )}
              style={currentVariant.getItemStyle(active)}
              onClick={() => onValueChange?.(item.value)}
            >
              <span className="truncate">{item.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
