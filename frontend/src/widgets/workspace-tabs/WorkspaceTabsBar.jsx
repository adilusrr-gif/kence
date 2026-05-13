import React from 'react'
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

  return (
    <div className="workspace-tabs" role="navigation" aria-label="Workspace tabs">
      <div className="workspace-tabs__rail">
        <div className="workspace-tabs__strip" role="list" aria-label="Open workspace tabs">
          {openTabs.length > 0 ? (
            openTabs.map((tab) => {
              const isActive = tab.id === activeTab?.id
              const sessionLabel = tab.sessionId ? tab.sessionId.slice(0, 8) : 'no session'
              const documentLabel = tab.documentName || 'Untitled'

              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`workspace-tabs__tab${isActive ? ' workspace-tabs__tab--active' : ''}`}
                  role="listitem"
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={`${tab.title}. ${documentLabel}. ${sessionLabel}.`}
                  title={`${tab.title} · ${documentLabel}`}
                >
                  <span className="workspace-tabs__tab-main">
                    <span className="workspace-tabs__tab-title">{tab.title}</span>
                    <span className="workspace-tabs__tab-meta">
                      <span className="workspace-tabs__tab-route">{tab.routePath}</span>
                      {tab.dirty ? <span className="workspace-tabs__tab-dot" aria-hidden="true" /> : null}
                    </span>
                  </span>

                  <span className="workspace-tabs__tab-badge" aria-hidden="true">
                    {isActive ? 'Active' : tab.type === 'legacy-route' ? 'Legacy' : 'Tab'}
                  </span>
                </button>
              )
            })
          ) : (
            <div className="workspace-tabs__empty" role="note">
              No workspace tabs yet
            </div>
          )}
        </div>

        <div className="workspace-tabs__actions" aria-label="Tab actions">
          <TabAction label="Previous tab" icon={<ArrowLeft size={14} aria-hidden="true" />} />
          <TabAction label="Tab overview" icon={<MoreHorizontal size={14} aria-hidden="true" />} />
          <TabAction label="Tab mode" icon={<Square size={13} aria-hidden="true" />} />
        </div>
      </div>
    </div>
  )
}

