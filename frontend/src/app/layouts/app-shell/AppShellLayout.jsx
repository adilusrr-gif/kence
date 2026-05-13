import React from 'react'
import { ShellRegionBoundary } from '@/app/boundaries'

export default function AppShellLayout({
  leftRail,
  topCommandBar,
  mainCanvas,
  rightPanel,
  bottomActivity,
}) {
  return (
    <div className="app-shell-layout">
      <ShellRegionBoundary regionName="left-rail-shell">
        <div className="app-shell-layout__left-rail">
          {leftRail}
        </div>
      </ShellRegionBoundary>

      <div className="app-shell-layout__body">
        <ShellRegionBoundary regionName="top-command-bar-shell">
          <header className="app-shell-layout__top-bar">
            {topCommandBar}
          </header>
        </ShellRegionBoundary>

        <div className="app-shell-layout__workspace">
          <ShellRegionBoundary regionName="main-canvas-host">
            <main className="app-shell-layout__canvas">
              {mainCanvas}
            </main>
          </ShellRegionBoundary>

          <ShellRegionBoundary regionName="right-panel-shell">
            <aside className="app-shell-layout__right-panel">
              {rightPanel}
            </aside>
          </ShellRegionBoundary>
        </div>

        <ShellRegionBoundary regionName="bottom-activity-shell">
          <footer className="app-shell-layout__bottom-rail">
            {bottomActivity}
          </footer>
        </ShellRegionBoundary>
      </div>
    </div>
  )
}

