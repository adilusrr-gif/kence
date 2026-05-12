import { create } from 'zustand'
import { persist } from 'zustand/middleware'

function createLegacyTab({
  tabId,
  routePath,
  title,
  sessionId,
  documentName,
  workspaceId,
}) {
  return {
    id: tabId,
    workspaceId,
    sessionId: sessionId ?? null,
    type: 'legacy-route',
    title,
    routePath,
    dirty: false,
    restorable: true,
    documentName: documentName || '',
    lastVisitedAt: Date.now(),
  }
}

export const useSessionTabsStore = create(
  persist(
    (set) => ({
      tabsById: {},
      tabOrder: [],
      activeTabId: null,
      openedWorkspaceIds: [],
      restoreMetaByTabId: {},
      closedTabStack: [],

      hydrateSessionTabs: ({
        tabId = null,
        routePath = '/',
        title = 'Workspace',
        workspaceId = null,
        sessionId = null,
        documentName = '',
        authenticated = false,
      } = {}) => set((state) => {
        if (!authenticated || !tabId || !workspaceId) {
          return {
            activeTabId: null,
            openedWorkspaceIds: [],
          }
        }

        return {
          tabsById: {
            ...state.tabsById,
            [tabId]: createLegacyTab({
              tabId,
              routePath,
              title,
              sessionId,
              documentName,
              workspaceId,
            }),
          },
          tabOrder: state.tabOrder.includes(tabId)
            ? state.tabOrder
            : [...state.tabOrder, tabId],
          activeTabId: tabId,
          openedWorkspaceIds: state.openedWorkspaceIds.includes(workspaceId)
            ? state.openedWorkspaceIds
            : [...state.openedWorkspaceIds, workspaceId],
          restoreMetaByTabId: {
            ...state.restoreMetaByTabId,
            [tabId]: {
              routePath,
              workspaceId,
              lastSessionId: sessionId ?? null,
              lastDocumentName: documentName || '',
              lastVisitedAt: Date.now(),
            },
          },
        }
      }),

      setActiveTab: (activeTabId) => set({ activeTabId }),

      clearSessionTabs: () => set({
        tabsById: {},
        tabOrder: [],
        activeTabId: null,
        openedWorkspaceIds: [],
        restoreMetaByTabId: {},
        closedTabStack: [],
      }),
    }),
    {
      name: 'kence-session-tabs-shadow',
      partialize: (state) => ({
        tabsById: state.tabsById,
        tabOrder: state.tabOrder,
        activeTabId: state.activeTabId,
        openedWorkspaceIds: state.openedWorkspaceIds,
        restoreMetaByTabId: state.restoreMetaByTabId,
        closedTabStack: state.closedTabStack,
      }),
    },
  ),
)

export const selectActiveTab = (state) => (
  state.activeTabId ? state.tabsById[state.activeTabId] ?? null : null
)
export const selectOpenTabs = (state) => state.tabOrder.map((tabId) => state.tabsById[tabId]).filter(Boolean)
export const selectOpenedWorkspaceIds = (state) => state.openedWorkspaceIds

export function syncSessionTabsShadow(payload) {
  useSessionTabsStore.getState().hydrateSessionTabs(payload)
}

export function clearSessionTabsShadow() {
  useSessionTabsStore.getState().clearSessionTabs()
}
