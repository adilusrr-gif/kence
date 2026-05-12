import { create } from 'zustand'

function createContextEnvelope(sessionId, documentName) {
  if (!sessionId) {
    return null
  }

  return {
    sessionId,
    activeDocumentName: documentName || '',
    scope: 'legacy-page',
    mode: 'document',
    activeAssetIds: [],
    selectedEntityIds: [],
    selectedEvidenceIds: [],
    pinnedContextIds: [],
    openWidgetIds: [],
    layoutPreset: 'legacy',
    artifactRefs: [],
  }
}

export const useWorkspaceStore = create((set) => ({
  activeWorkspaceId: null,
  activeSessionId: null,
  activeDocumentName: '',
  workspaceIds: [],
  workspaceMetaById: {},
  contextEnvelopeBySessionId: {},

  hydrateWorkspace: ({ activeWorkspaceId = null, activeSessionId = null, activeDocumentName = '' } = {}) => set((state) => {
    const nextContextEnvelopeBySessionId = { ...state.contextEnvelopeBySessionId }

    if (activeSessionId) {
      nextContextEnvelopeBySessionId[activeSessionId] = createContextEnvelope(activeSessionId, activeDocumentName)
    }

    return {
      activeWorkspaceId,
      activeSessionId,
      activeDocumentName,
      contextEnvelopeBySessionId: nextContextEnvelopeBySessionId,
    }
  }),

  setActiveWorkspace: (activeWorkspaceId) => set({ activeWorkspaceId }),

  setActiveSession: (activeSessionId) => set((state) => ({
    activeSessionId,
    contextEnvelopeBySessionId: activeSessionId
      ? {
          ...state.contextEnvelopeBySessionId,
          [activeSessionId]: state.contextEnvelopeBySessionId[activeSessionId] ?? createContextEnvelope(activeSessionId, state.activeDocumentName),
        }
      : state.contextEnvelopeBySessionId,
  })),

  setActiveDocumentName: (activeDocumentName) => set((state) => ({
    activeDocumentName,
    contextEnvelopeBySessionId: state.activeSessionId
      ? {
          ...state.contextEnvelopeBySessionId,
          [state.activeSessionId]: {
            ...(state.contextEnvelopeBySessionId[state.activeSessionId] ?? createContextEnvelope(state.activeSessionId, activeDocumentName)),
            activeDocumentName,
          },
        }
      : state.contextEnvelopeBySessionId,
  })),

  patchSessionContext: (sessionId, patch) => set((state) => ({
    contextEnvelopeBySessionId: sessionId
      ? {
          ...state.contextEnvelopeBySessionId,
          [sessionId]: {
            ...(state.contextEnvelopeBySessionId[sessionId] ?? createContextEnvelope(sessionId, '')),
            ...patch,
          },
        }
      : state.contextEnvelopeBySessionId,
  })),
}))

export const selectActiveWorkspaceId = (state) => state.activeWorkspaceId
export const selectActiveSessionId = (state) => state.activeSessionId
export const selectActiveDocumentName = (state) => state.activeDocumentName
export const selectActiveSessionContext = (state) => (
  state.activeSessionId ? state.contextEnvelopeBySessionId[state.activeSessionId] ?? null : null
)

export function syncWorkspaceShadow(partial) {
  useWorkspaceStore.getState().hydrateWorkspace(partial)
}
