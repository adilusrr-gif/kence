import React, { useRef, useCallback, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Plus } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useSessionTabsStore, selectActiveTab, selectOpenTabs } from '@/shared/stores'

export default function WorkspaceTabsBar({ onTabNavigate }) {
  const activeTab = useSessionTabsStore(selectActiveTab)
  const openTabs = useSessionTabsStore(useShallow(selectOpenTabs))
  const setActiveTab = useSessionTabsStore((state) => state.setActiveTab)
  const openTab = useSessionTabsStore((state) => state.openTab)
  const closeTab = useSessionTabsStore((state) => state.closeTab)
  const restoreClosedTab = useSessionTabsStore((state) => state.restoreClosedTab)
  const tabRefs = useRef({})

  const handleTabClick = useCallback((tab) => {
    setActiveTab(tab.id)
    onTabNavigate?.(tab.routePath)
  }, [setActiveTab, onTabNavigate])

  const handleClose = useCallback((e, tabId) => {
    e.stopPropagation()
    closeTab(tabId)
  }, [closeTab])

  const handleNewTab = useCallback(() => {
    openTab({ routePath: '/upload' })
    onTabNavigate?.('/upload')
  }, [openTab, onTabNavigate])

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
      const tab = openTabs.find((t) => t.id === targetId)
      if (tab) handleTabClick(tab)
      tabRefs.current[targetId]?.focus()
    }
  }, [openTabs, handleTabClick])

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault()
        const state = useSessionTabsStore.getState()
        if (state.activeTabId) closeTab(state.activeTabId)
      } else if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        e.preventDefault()
        restoreClosedTab()
      } else if (e.ctrlKey && !e.shiftKey && e.key === 't') {
        e.preventDefault()
        handleNewTab()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeTab, restoreClosedTab, handleNewTab])

  if (!openTabs.length) return null

  return (
    <div
      className="workspace-tabs__strip"
      role="tablist"
      aria-label="Открытые вкладки"
    >
      <AnimatePresence initial={false}>
        {openTabs.map((tab) => {
          const isActive = tab.id === activeTab?.id
          return (
            <motion.button
              key={tab.id}
              ref={(el) => { tabRefs.current[tab.id] = el }}
              type="button"
              className={`workspace-tabs__tab${isActive ? ' workspace-tabs__tab--active' : ''}`}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              title={tab.documentName ? `${tab.title} · ${tab.documentName}` : tab.title}
              onClick={() => handleTabClick(tab)}
              onKeyDown={(e) => handleKeyDown(e, tab.id)}
              initial={{ opacity: 0, x: -8, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -8, scale: 0.92, width: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              layout
            >
              <span className="workspace-tabs__tab-title">{tab.title}</span>
              {tab.dirty && <span className="workspace-tabs__dot" aria-hidden="true" />}
              {openTabs.length > 1 && (
                <span
                  role="button"
                  aria-label={`Закрыть ${tab.title}`}
                  className="workspace-tabs__close"
                  onClick={(e) => handleClose(e, tab.id)}
                  tabIndex={-1}
                >
                  <X size={12} />
                </span>
              )}
            </motion.button>
          )
        })}
      </AnimatePresence>

      <button
        type="button"
        className="workspace-tabs__new"
        aria-label="Новая вкладка (Ctrl+T)"
        title="Новая вкладка (Ctrl+T)"
        onClick={handleNewTab}
      >
        <Plus size={14} />
      </button>
    </div>
  )
}
