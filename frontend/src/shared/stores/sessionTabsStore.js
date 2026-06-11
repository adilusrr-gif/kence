import { create } from 'zustand'

// Очищаем устаревший ключ persist-стора чтобы не было ошибок гидрации
try { localStorage.removeItem('kence-session-tabs-shadow') } catch { /* ignore */ }

export const ROUTE_TAB_MAP = {
  '/':              { title: 'Dashboard',    icon: 'LayoutDashboard' },
  '/home':          { title: 'Home',         icon: 'Home' },
  '/upload':        { title: 'Upload',       icon: 'Upload' },
  '/workspace':     { title: 'Workspace',    icon: 'MessageSquare' },
  '/compare':       { title: 'Compare',      icon: 'GitCompare' },
  '/presentation':  { title: 'Presentation', icon: 'Presentation' },
  '/image-generation': { title: 'AI Images',  icon: 'ImagePlus' },
  '/convert':       { title: 'Convert',      icon: 'RefreshCw' },
  '/profile':       { title: 'Profile',      icon: 'User' },
  '/admin':         { title: 'Admin',        icon: 'Shield' },
  '/ai-settings':   { title: 'AI Settings',  icon: 'Cpu' },
  '/analytics':     { title: 'Analytics',    icon: 'BarChart2' },
  '/library':       { title: 'Library',      icon: 'Library' },
  '/org/settings':  { title: 'Org Settings', icon: 'Settings' },
  '/executive':     { title: 'Executive',    icon: 'TrendingUp' },
  '/graph':         { title: 'Graph',        icon: 'Network' },
  '/agents':        { title: 'AI Agents',    icon: 'Bot' },
  '/agents/history':{ title: 'Agent History',icon: 'Bot' },
}

let _tabIdCounter = 1
function genTabId() { return `tab-${Date.now()}-${_tabIdCounter++}` }

function createLegacyTab({
  tabId,
  routePath,
  title,
  sessionId,
  documentName,
  workspaceId,
  icon,
}) {
  return {
    id: tabId,
    workspaceId,
    sessionId: sessionId ?? null,
    type: 'legacy-route',
    title,
    routePath,
    icon: icon || ROUTE_TAB_MAP[routePath]?.icon || 'FileText',
    dirty: false,
    restorable: true,
    documentName: documentName || '',
    lastVisitedAt: Date.now(),
  }
}

export const useSessionTabsStore = create((set, get) => ({
  tabsById: {},
  tabOrder: [],
  activeTabId: null,
  openedWorkspaceIds: [],
  restoreMetaByTabId: {},
  closedTabStack: [],

  // Open or activate a tab by routePath
  openTab: ({ title, routePath, type = 'legacy-route', sessionId = null, documentName = '', icon, workspaceId = null } = {}) => set((state) => {
    const meta = ROUTE_TAB_MAP[routePath]
    const resolvedTitle = title || meta?.title || routePath
    const resolvedIcon = icon || meta?.icon || 'FileText'

    // If a tab with this routePath already exists, just activate it
    const existingId = state.tabOrder.find((id) => state.tabsById[id]?.routePath === routePath)
    if (existingId) {
      return { activeTabId: existingId }
    }

    const tabId = genTabId()
    return {
      tabsById: {
        ...state.tabsById,
        [tabId]: createLegacyTab({ tabId, routePath, title: resolvedTitle, sessionId, documentName, workspaceId, icon: resolvedIcon }),
      },
      tabOrder: [...state.tabOrder, tabId],
      activeTabId: tabId,
      openedWorkspaceIds: workspaceId && !state.openedWorkspaceIds.includes(workspaceId)
        ? [...state.openedWorkspaceIds, workspaceId]
        : state.openedWorkspaceIds,
    }
  }),

  closeTab: (tabId) => set((state) => {
    const tab = state.tabsById[tabId]
    if (!tab) return state

    const newOrder = state.tabOrder.filter((id) => id !== tabId)
    const newTabsById = { ...state.tabsById }
    delete newTabsById[tabId]

    // Push to closed stack (max 10)
    const stackEntry = { id: tabId, title: tab.title, routePath: tab.routePath, closedAt: Date.now() }
    const newStack = [stackEntry, ...state.closedTabStack].slice(0, 10)

    // Determine next active tab
    let nextActiveId = state.activeTabId
    if (state.activeTabId === tabId) {
      const currentIdx = state.tabOrder.indexOf(tabId)
      if (newOrder.length > 0) {
        nextActiveId = newOrder[Math.max(0, currentIdx - 1)]
      } else {
        nextActiveId = null
      }
    }

    return {
      tabsById: newTabsById,
      tabOrder: newOrder,
      activeTabId: nextActiveId,
      closedTabStack: newStack,
    }
  }),

  restoreClosedTab: () => set((state) => {
    if (state.closedTabStack.length === 0) return state

    const [entry, ...rest] = state.closedTabStack
    const tabId = genTabId()
    const meta = ROUTE_TAB_MAP[entry.routePath]

    return {
      tabsById: {
        ...state.tabsById,
        [tabId]: createLegacyTab({
          tabId,
          routePath: entry.routePath,
          title: entry.title,
          icon: meta?.icon || 'FileText',
        }),
      },
      tabOrder: [...state.tabOrder, tabId],
      activeTabId: tabId,
      closedTabStack: rest,
    }
  }),

  reorderTabs: (newOrder) => set({ tabOrder: newOrder }),

  markTabDirty: (tabId, dirty) => set((state) => {
    if (!state.tabsById[tabId]) return state
    return {
      tabsById: {
        ...state.tabsById,
        [tabId]: { ...state.tabsById[tabId], dirty },
      },
    }
  }),

  renameTab: (tabId, title) => set((state) => {
    if (!state.tabsById[tabId]) return state
    return {
      tabsById: {
        ...state.tabsById,
        [tabId]: { ...state.tabsById[tabId], title },
      },
    }
  }),

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
