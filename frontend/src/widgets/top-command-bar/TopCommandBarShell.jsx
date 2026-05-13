import React from 'react'

export default function TopCommandBarShell({
  currentLabel,
  documentName,
}) {
  return (
    <div className="shell-region shell-region--top-command">
      <div className="shell-placeholder shell-placeholder--top" role="group" aria-label="Текущее рабочее пространство">
        <div className="shell-placeholder__meta">
          <span className="shell-placeholder__eyebrow">Рабочее пространство</span>
          <strong className="shell-placeholder__title">{currentLabel || 'KENCE.ai'}</strong>
        </div>

        {documentName && (
          <div className="shell-placeholder__chips" aria-label="Активный документ">
            <span className="shell-chip shell-chip--muted">
              {documentName}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
