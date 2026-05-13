import React from 'react'

export default function BottomActivityShellPlaceholder() {
  return (
    <div className="shell-region shell-region--bottom-activity">
      <div className="shell-placeholder shell-placeholder--bottom" aria-label="Bottom activity placeholder">
        <span className="shell-placeholder__eyebrow">Bottom Rail</span>
        <strong className="shell-placeholder__title">Activity shell placeholder</strong>
        <p className="shell-placeholder__body">
          No activity runtime yet. This region reserves passive shell structure only.
        </p>
      </div>
    </div>
  )
}

