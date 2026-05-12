import { create } from 'zustand'

export const useOrchestrationStore = create((set) => ({
  activeIntent: null,
  queuedIntentIds: [],
  intentsById: {},
  currentExecutionId: null,
  executionById: {},
  taskMetaById: {},
  actionRegistryById: {},
  readiness: {
    plannerReady: false,
    taskGraphReady: false,
    toolBindingReady: false,
    resultRoutingReady: false,
    diagnosticsReady: true,
  },
  diagnostics: {
    lastDiagnosticCode: null,
    lastDiagnosticMessage: '',
    lastFailureAt: null,
  },
  timestamps: {
    initializedAt: Date.now(),
    lastStateChangeAt: null,
  },

  hydrateOrchestrationReadiness: (partial = {}) => set((state) => ({
    readiness: {
      ...state.readiness,
      ...(partial.readiness ?? {}),
    },
    timestamps: {
      ...state.timestamps,
      lastStateChangeAt: Date.now(),
    },
  })),

  registerActionDescriptor: (actionId, descriptor = {}) => set((state) => {
    if (!actionId) {
      return state
    }

    return {
      actionRegistryById: {
        ...state.actionRegistryById,
        [actionId]: {
          id: actionId,
          label: '',
          source: 'ui',
          scope: null,
          enabled: true,
          version: 1,
          updatedAt: Date.now(),
          ...state.actionRegistryById[actionId],
          ...descriptor,
          updatedAt: Date.now(),
        },
      },
      timestamps: {
        ...state.timestamps,
        lastStateChangeAt: Date.now(),
      },
    }
  }),

  registerIntentMeta: (intentMeta) => set((state) => {
    if (!intentMeta?.id) {
      return state
    }

    const nextQueuedIntentIds = state.queuedIntentIds.includes(intentMeta.id)
      ? state.queuedIntentIds
      : [...state.queuedIntentIds, intentMeta.id]

    return {
      activeIntent: state.activeIntent ?? intentMeta.id,
      queuedIntentIds: nextQueuedIntentIds,
      intentsById: {
        ...state.intentsById,
        [intentMeta.id]: {
          id: intentMeta.id,
          type: intentMeta.type ?? 'unknown',
          source: intentMeta.source ?? 'ui',
          scope: intentMeta.scope ?? null,
          correlationId: intentMeta.correlationId ?? null,
          status: intentMeta.status ?? 'queued',
          createdAt: intentMeta.createdAt ?? Date.now(),
          updatedAt: Date.now(),
        },
      },
      timestamps: {
        ...state.timestamps,
        lastStateChangeAt: Date.now(),
      },
    }
  }),

  upsertExecutionMeta: (executionId, meta = {}) => set((state) => {
    if (!executionId) {
      return state
    }

    return {
      currentExecutionId: meta.makeCurrent === false ? state.currentExecutionId : executionId,
      executionById: {
        ...state.executionById,
        [executionId]: {
          id: executionId,
          intentId: null,
          status: 'idle',
          phase: 'created',
          correlationId: null,
          taskIds: [],
          startedAt: null,
          completedAt: null,
          errorCode: null,
          errorMessage: '',
          updatedAt: Date.now(),
          ...state.executionById[executionId],
          ...meta,
          updatedAt: Date.now(),
        },
      },
      timestamps: {
        ...state.timestamps,
        lastStateChangeAt: Date.now(),
      },
    }
  }),

  upsertTaskMeta: (taskId, meta = {}) => set((state) => {
    if (!taskId) {
      return state
    }

    return {
      taskMetaById: {
        ...state.taskMetaById,
        [taskId]: {
          id: taskId,
          executionId: null,
          actionId: null,
          label: '',
          status: 'idle',
          correlationId: null,
          sessionId: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          ...state.taskMetaById[taskId],
          ...meta,
          updatedAt: Date.now(),
        },
      },
      timestamps: {
        ...state.timestamps,
        lastStateChangeAt: Date.now(),
      },
    }
  }),

  attachTaskToExecution: (executionId, taskId) => set((state) => {
    const execution = state.executionById[executionId]

    if (!execution || !taskId) {
      return state
    }

    return {
      executionById: {
        ...state.executionById,
        [executionId]: {
          ...execution,
          taskIds: execution.taskIds.includes(taskId)
            ? execution.taskIds
            : [...execution.taskIds, taskId],
          updatedAt: Date.now(),
        },
      },
      timestamps: {
        ...state.timestamps,
        lastStateChangeAt: Date.now(),
      },
    }
  }),

  setExecutionDiagnostic: (executionId, diagnostic = {}) => set((state) => ({
    executionById: executionId && state.executionById[executionId]
      ? {
          ...state.executionById,
          [executionId]: {
            ...state.executionById[executionId],
            errorCode: diagnostic.errorCode ?? state.executionById[executionId].errorCode,
            errorMessage: diagnostic.errorMessage ?? state.executionById[executionId].errorMessage,
            updatedAt: Date.now(),
          },
        }
      : state.executionById,
    diagnostics: {
      lastDiagnosticCode: diagnostic.errorCode ?? state.diagnostics.lastDiagnosticCode,
      lastDiagnosticMessage: diagnostic.errorMessage ?? state.diagnostics.lastDiagnosticMessage,
      lastFailureAt: Date.now(),
    },
    timestamps: {
      ...state.timestamps,
      lastStateChangeAt: Date.now(),
    },
  })),

  resetOrchestrationScope: () => set((state) => ({
    activeIntent: null,
    queuedIntentIds: [],
    intentsById: {},
    currentExecutionId: null,
    executionById: {},
    taskMetaById: {},
    diagnostics: {
      lastDiagnosticCode: null,
      lastDiagnosticMessage: '',
      lastFailureAt: null,
    },
    readiness: {
      ...state.readiness,
    },
    timestamps: {
      ...state.timestamps,
      lastStateChangeAt: Date.now(),
    },
  })),
}))

export const selectCurrentExecution = (state) => (
  state.currentExecutionId ? state.executionById[state.currentExecutionId] ?? null : null
)
export const selectQueuedIntents = (state) => (
  state.queuedIntentIds.map((intentId) => state.intentsById[intentId]).filter(Boolean)
)
export const selectTaskMeta = (state) => state.taskMetaById
export const selectActionRegistry = (state) => state.actionRegistryById
export const selectOrchestrationReadiness = (state) => state.readiness

export function syncOrchestrationShadow(partial) {
  useOrchestrationStore.getState().hydrateOrchestrationReadiness(partial)
}
