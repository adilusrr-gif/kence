import React from 'react'

export default function Skeleton({ width, height = '1em', borderRadius = '6px', className = '', style = {} }) {
  return (
    <div
      className={`motion-skeleton-shimmer ${className}`}
      style={{ width, height, borderRadius, ...style }}
      aria-hidden="true"
    />
  )
}
