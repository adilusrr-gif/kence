import React, { useEffect, useState } from 'react'
import { getStoredUser } from '@/lib/api'
import { useAuthStore } from '@/shared/stores/authStore'
import { useShellStore } from '@/shared/stores/shellStore'

function ShellSkeleton() {
  return (
    <div className="shell-skeleton" aria-hidden="true" aria-label="Loading shell">
      <div className="shell-skeleton__topbar skeleton" />
      <div className="shell-skeleton__tabbar skeleton" />
      <div className="shell-skeleton__body">
        <div className="shell-skeleton__rail skeleton" />
        <div className="shell-skeleton__canvas" />
      </div>
    </div>
  )
}

export default function ShellHydrator({ children }) {
  const [ready, setReady] = useState(false)
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const slowTimer = setTimeout(() => setSlow(true), 500)

    // Phase boot: hydrate auth
    const storedUser = getStoredUser()
    useAuthStore.getState().hydrateAuth(storedUser)

    // Phase shell-preferences
    useShellStore.getState().hydrateShell({
      theme: localStorage.getItem('theme') || 'dark',
      appName: localStorage.getItem('appName'),
      appEmoji: localStorage.getItem('appEmoji'),
      leftRail: {
        collapsed: localStorage.getItem('leftRailCollapsed') === 'true',
      },
    })

    // Hydrate org branding (best-effort, non-blocking)
    const orgSlug = localStorage.getItem('kence_current_org_slug') || 'default'
    fetch(`/api/branding/${orgSlug}`)
      .then((r) => r.ok ? r.json() : null)
      .then((b) => {
        if (!b) return
        if (b.accent_color) document.documentElement.style.setProperty('--accent-primary', b.accent_color)
        if (b.app_name) useShellStore.getState().setAppName(b.app_name)
      })
      .catch(() => {})

    setReady(true)
    clearTimeout(slowTimer)
    return () => clearTimeout(slowTimer)
  }, [])

  if (!ready && slow) return <ShellSkeleton />
  return <>{children}</>
}
