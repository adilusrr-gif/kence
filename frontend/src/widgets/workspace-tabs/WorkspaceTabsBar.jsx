import React, { useRef, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useSessionTabsStore, selectActiveTab, selectOpenTabs } from '@/shared/stores'

export default function WorkspaceTabsBar() {
  const activeTab = useSessionTabsStore(selectActiveTab)
  const openTabs = useSessionTabsStore(useShallow(selectOpenTabs))
  const setActiveTab = useSessionTabsStore((state) => state.setActiveTab)
  const tabRefs = useRef({})

  const handleKeyDown = useCallback((e, tabId) => {
    const ids = openTabs.map((t) => t.id)
    const idx = ids.indexOf(tabId)
    let targetId = null

    if (e.key === 'ArrowRight') targetId = ids[(idx + 1) % ids.length]
    else if (e.key === 'ArrowLeft') targetId = ids[(idx - 1 + ids.length) % ids.length]
    else if (e.key === 'Home') targetId = ids[0]
    else if (e.key === 'End') targetId = ids[ids.length - 1]

    if (targetId) {
      e.preventDefault()
      setActiveTab(targetId)
      tabRefs.current[targetId]?.focus()
    }
  }, [openTabs, setActiveTab])

  if (!openTabs.length) return null

  return (
    <div
      className="workspace-tabs__strip"
      role="tablist"
      aria-label="Открытые вкладки"
    >
      {openTabs.map((tab) => {
        const isActive = tab.id === activeTab?.id
        return (
          <button
            key={tab.id}
            ref={(el) => { tabRefs.current[tab.id] = el }}
            type="button"
            className={`workspace-tabs__tab${isActive ? ' workspace-tabs__tab--active' : ''}`}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            title={tab.documentName ? `${tab.title} · ${tab.documentName}` : tab.title}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, tab.id)}
          >
            {tab.title}
            {tab.dirty && <span className="workspace-tabs__dot" aria-hidden="true" />}
          </button>
        )
      })}
    </div>
  )
}
