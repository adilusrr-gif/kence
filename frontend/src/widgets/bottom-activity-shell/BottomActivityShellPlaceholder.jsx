import React from 'react'

export default function BottomActivityShellPlaceholder() {
  return (
    <div className="shell-region shell-region--bottom-activity">
      <div className="shell-placeholder shell-placeholder--bottom" role="note" aria-label="Workspace activity panel">
        <span className="shell-placeholder__eyebrow">Workspace activity</span>
        <strong className="shell-placeholder__title">Activity updates</strong>
        <p className="shell-placeholder__body">
          Background status and workflow updates will appear here as shell activity surfaces are added.
        </p>
      </div>
    </div>
  )
}
