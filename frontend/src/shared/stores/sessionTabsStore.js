import { create } from 'zustand'

// Очищаем устаревший ключ persist-стора чтобы не было ошибок гидрации
try { localStorage.removeItem('kence-session-tabs-shadow') } catch { /* ignore */ }

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

export const useSessionTabsStore = create((set) => ({
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
      if (state.activeTabId === null && state.openedWorkspaceIds.length === 0) return state
      return { activeTabId: null, openedWorkspaceIds: [] }
    }

    const existingTab = state.tabsById[tabId]
    const alreadySynced =
      existingTab &&
      existingTab.routePath === routePath &&
      existingTab.sessionId === (sessionId ?? null) &&
      existingTab.documentName === (documentName || '') &&
      existingTab.title === title &&
      state.activeTabId === tabId &&
      state.tabOrder.includes(tabId) &&
      state.openedWorkspaceIds.includes(workspaceId)

    if (alreadySynced) return state

    return {
      tabsById: {
        ...state.tabsById,
        [tabId]: createLegacyTab({ tabId, routePath, title, sessionId, documentName, workspaceId }),
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
}))

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
