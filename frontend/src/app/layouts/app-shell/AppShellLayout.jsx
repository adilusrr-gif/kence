import React from 'react'
import { ShellRegionBoundary } from '@/app/boundaries'

export default function AppShellLayout({
  tabsBar,
  leftRail,
  topCommandBar,
  mainCanvas,
  rightPanel,
  bottomActivity,
}) {
  const hasBottomActivity = Boolean(bottomActivity)

  return (
    <div
      className={`app-shell-layout${hasBottomActivity ? ' app-shell-layout--with-bottom-rail' : ''}`}
    >
      <ShellRegionBoundary regionName="left-rail-shell">
        <div className="app-shell-layout__left-rail" aria-label="Primary navigation">
          {leftRail}
        </div>
      </ShellRegionBoundary>

      <div className="app-shell-layout__body">
        {topCommandBar && (
          <ShellRegionBoundary regionName="top-bar">
            <div className="app-shell-layout__top-bar">
              {topCommandBar}
            </div>
          </ShellRegionBoundary>
        )}

        {tabsBar ? (
          <ShellRegionBoundary regionName="workspace-tabs-shell">
            <div className="app-shell-layout__tabs">
              {tabsBar}
            </div>
          </ShellRegionBoundary>
        ) : null}

        <div className="app-shell-layout__workspace">
          <ShellRegionBoundary regionName="main-canvas-host">
            <main className="app-shell-layout__canvas" aria-label="Workspace content">
              {mainCanvas}
            </main>
          </ShellRegionBoundary>

          {rightPanel ? (
            <ShellRegionBoundary regionName="right-panel-shell">
              {rightPanel}
            </ShellRegionBoundary>
          ) : null}
        </div>

        {hasBottomActivity ? (
          <ShellRegionBoundary regionName="bottom-activity-shell">
            <div className="app-shell-layout__bottom-rail">
              {bottomActivity}
            </div>
          </ShellRegionBoundary>
        ) : null}
      </div>
    </div>
  )
}
