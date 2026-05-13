import React from 'react'

export default function TopCommandBarShell({
  currentLabel,
  documentName,
}) {
  return (
    <div className="shell-region shell-region--top-command">
      <div className="shell-placeholder shell-placeholder--top" role="group" aria-label="Current workspace">
        <div className="shell-placeholder__meta">
          <span className="shell-placeholder__eyebrow">Current workspace</span>
          <strong className="shell-placeholder__title">{currentLabel || 'Workspace'}</strong>
        </div>

        <div className="shell-placeholder__chips" aria-label="Workspace summary">
          <span className="shell-chip">Current view</span>
          <span className="shell-chip shell-chip--muted">
            {documentName || 'No active document'}
          </span>
        </div>
      </div>
    </div>
  )
}
