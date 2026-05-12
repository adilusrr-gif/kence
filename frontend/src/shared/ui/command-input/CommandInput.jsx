import React from 'react'
import { cn } from '@/shared/lib/cn'
import { Input } from '@/shared/ui/input'
import { Inline } from '@/shared/ui/inline'

export function CommandInput({
  mode = null,
  scope = null,
  placeholder,
  leadingIcon = null,
  trailingActions = null,
  className,
  inputClassName,
  style,
  ...props
}) {
  return (
    <Inline
      align="center"
      gap="sm"
      className={cn(
        'w-full rounded-[var(--radius-xl)] border px-[var(--space-2)] py-[var(--space-2)]',
        className
      )}
      style={{
        backgroundColor: 'var(--bg-surface-1)',
        borderColor: 'var(--border-default)',
        boxShadow: 'var(--shadow-xs)',
        ...style,
      }}
    >
      {mode ? (
        <span
          aria-hidden="true"
          className="shrink-0 rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-1)]"
          style={{
            backgroundColor: 'var(--bg-surface-2)',
            color: 'var(--text-secondary)',
            fontSize: 'var(--text-xs)',
            lineHeight: 1,
          }}
        >
          {mode}
        </span>
      ) : null}

      <Input
        leadingIcon={leadingIcon}
        placeholder={placeholder}
        className={cn('border-none shadow-none', inputClassName)}
        style={{
          backgroundColor: 'transparent',
          flex: 1,
          minWidth: 0,
        }}
        {...props}
      />

      {scope ? (
        <span
          aria-hidden="true"
          className="shrink-0 rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-1)]"
          style={{
            backgroundColor: 'rgba(34, 211, 238, 0.12)',
            color: 'var(--accent-primary)',
            fontSize: 'var(--text-xs)',
            lineHeight: 1,
          }}
        >
          {scope}
        </span>
      ) : null}

      {trailingActions ? <div className="flex shrink-0 items-center gap-2">{trailingActions}</div> : null}
    </Inline>
  )
}
