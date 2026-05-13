import React from 'react'

export default function RightPanelShellPlaceholder() {
  return (
    <div className="shell-region shell-region--right-panel">
      <div className="shell-placeholder shell-placeholder--side" aria-label="Right panel placeholder">
        <span className="shell-placeholder__eyebrow">Right Panel</span>
        <strong className="shell-placeholder__title">Intelligence panel placeholder</strong>
        <p className="shell-placeholder__body">
          Passive shell region only. Legacy pages remain the live domain owners.
        </p>
      </div>
    </div>
  )
}

