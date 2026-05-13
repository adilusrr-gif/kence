import React from 'react'

export default function LegacyPageCanvasHost({ children }) {
  return (
    <div className="shell-region shell-region--main-canvas">
      <div className="legacy-page-canvas-host">
        {children}
      </div>
    </div>
  )
}

