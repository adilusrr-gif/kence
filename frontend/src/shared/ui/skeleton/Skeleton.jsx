import React from 'react'

export default function Skeleton({ width, height = '1em', borderRadius = '6px', className = '', style = {} }) {
  return (
    <div
      className={`motion-skeleton-shimmer ${className}`}
      style={{
        width,
        height,
        borderRadius,
        background: 'var(--bg-surface-2)',
        ...style,
      }}
      aria-hidden="true"
    />
  )
}

export function SkeletonCard({ rows = 3, style = {} }) {
  return (
    <div
      aria-hidden="true"
      style={{
        padding: '14px 16px',
        borderRadius: 'var(--bento-radius, 20px)',
        border: '1px solid var(--glass-border)',
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        ...style,
      }}
    >
      <Skeleton height="0.9rem" width="55%" style={{ marginBottom: 4 }} />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height="0.7rem" width={`${88 - i * 12}%`} />
      ))}
    </div>
  )
}

export function SkeletonStats({ count = 4 }) {
  return (
    <div
      aria-hidden="true"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(count, 4)}, 1fr)`,
        gap: 12,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            padding: '14px 16px',
            borderRadius: 'var(--bento-radius, 20px)',
            border: '1px solid var(--glass-border)',
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(var(--glass-blur))',
            WebkitBackdropFilter: 'blur(var(--glass-blur))',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Skeleton width={36} height="36px" borderRadius="10px" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Skeleton height="1.25rem" width="50%" />
            <Skeleton height="0.65rem" width="70%" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SkeletonGrid({ count = 6, minWidth = 240 }) {
  return (
    <div
      aria-hidden="true"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`,
        gap: 16,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} rows={3} />
      ))}
    </div>
  )
}
