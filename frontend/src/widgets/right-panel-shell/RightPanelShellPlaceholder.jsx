import React from 'react'

export default function RightPanelShellPlaceholder() {
  return (
    <div className="shell-region shell-region--right-panel">
      <div className="shell-placeholder shell-placeholder--side" role="note" aria-label="Workspace context panel">
        <span className="shell-placeholder__eyebrow">Workspace context</span>
        <strong className="shell-placeholder__title">Context details</strong>
        <p className="shell-placeholder__body">
          Active workspace details will appear here as shell-native regions are introduced.
        </p>
      </div>
    </div>
  )
}
