import React, { useRef, useCallback } from 'react'
import { ArrowLeft, MoreHorizontal, Square } from 'lucide-react'
import { useSessionTabsStore, selectActiveTab, selectOpenTabs } from '@/shared/stores'

function TabAction({ label, icon, disabled = true, onClick }) {
  return (
    <button
      type="button"
      className="workspace-tabs__action"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </button>
  )
}

export default function WorkspaceTabsBar() {
  const activeTab = useSessionTabsStore(selectActiveTab)
  const openTabs = useSessionTabsStore(selectOpenTabs)
  const setActiveTab = useSessionTabsStore((state) => state.setActiveTab)
  const tabRefs = useRef({})

  const handleKeyDown = useCallback((e, tabId) => {
    const ids = openTabs.map((t) => t.id)
    const idx = ids.indexOf(tabId)
    let targetId = null

    if (e.key === 'ArrowRight') {
      targetId = ids[(idx + 1) % ids.length]
    } else if (e.key === 'ArrowLeft') {
      targetId = ids[(idx - 1 + ids.length) % ids.length]
    } else if (e.key === 'Home') {
      targetId = ids[0]
    } else if (e.key === 'End') {
      targetId = ids[ids.length - 1]
    }

    if (targetId) {
      e.preventDefault()
      setActiveTab(targetId)
      tabRefs.current[targetId]?.focus()
    }
  }, [openTabs, setActiveTab])

  return (
    <div className="workspace-tabs">
      <div className="workspace-tabs__rail">
        <div
          className="workspace-tabs__strip"
          role="tablist"
          aria-label="Открытые вкладки"
        >
          {openTabs.length > 0 ? (
            openTabs.map((tab) => {
              const isActive = tab.id === activeTab?.id
              const metaLabel = tab.documentName || ''

              return (
                <button
                  key={tab.id}
                  ref={(el) => { tabRefs.current[tab.id] = el }}
                  type="button"
                  className={`workspace-tabs__tab${isActive ? ' workspace-tabs__tab--active' : ''}`}
                  role="tab"
                  aria-selected={isActive}
                  tabIndex={isActive ? 0 : -1}
                  aria-label={metaLabel ? `${tab.title}, ${metaLabel}` : tab.title}
                  title={metaLabel ? `${tab.title} · ${metaLabel}` : tab.title}
                  onClick={() => setActiveTab(tab.id)}
                  onKeyDown={(e) => handleKeyDown(e, tab.id)}
                >
                  <span className="workspace-tabs__tab-main">
                    <span className="workspace-tabs__tab-title">{tab.title}</span>
                    {metaLabel ? (
                      <span className="workspace-tabs__tab-meta">
                        <span className="workspace-tabs__tab-route">{metaLabel}</span>
                        {tab.dirty ? <span className="workspace-tabs__tab-dot" aria-hidden="true" /> : null}
                      </span>
                    ) : null}
                  </span>
                </button>
              )
            })
          ) : (
            <div className="workspace-tabs__empty" role="note">
              Нет открытых вкладок
            </div>
          )}
        </div>

        <div className="workspace-tabs__actions" aria-label="Действия с вкладками">
          <TabAction label="Предыдущая вкладка" icon={<ArrowLeft size={14} aria-hidden="true" />} />
          <TabAction label="Обзор вкладок" icon={<MoreHorizontal size={14} aria-hidden="true" />} />
          <TabAction label="Режим вкладки" icon={<Square size={13} aria-hidden="true" />} />
        </div>
      </div>
    </div>
  )
}
