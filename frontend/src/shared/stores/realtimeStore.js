import { create } from 'zustand'

const DEFAULT_CONNECTION_STATE = {
  status: 'idle',
  protocol: 'none',
  connectionScope: null,
  lastConnectedAt: null,
  lastDisconnectedAt: null,
  lastHeartbeatAt: null,
  lastEventAt: null,
  reconnectEligible: false,
  reconnectAttemptCount: 0,
  diagnosticCode: null,
  diagnosticMessage: '',
}

const DEFAULT_STREAM_STATE = {
  status: 'idle',
  activeCorrelationId: null,
  activeSessionId: null,
  transportMode: 'none',
  startedAt: null,
  completedAt: null,
  lastChunkAt: null,
  pendingChunkCount: 0,
  bufferedCorrelationIds: [],
}

export const useRealtimeStore = create((set) => ({
  transportMode: 'none',
  connectionState: DEFAULT_CONNECTION_STATE,
  streamState: DEFAULT_STREAM_STATE,
  pendingEventsById: {},
  pendingEventOrder: [],
  activityMetaById: {},
  streamBuffersByCorrelationId: {},
  subscriptionsByScope: {},
  readiness: {
    transportAdapterReady: false,
    eventNormalizationReady: false,
    diagnosticsReady: true,
    fallbackPollingReady: false,
  },
  timestamps: {
    initializedAt: Date.now(),
    lastStateChangeAt: null,
    lastDiagnosticAt: null,
  },

  hydrateRealtimeReadiness: (partial = {}) => set((state) => ({
    transportMode: partial.transportMode ?? state.transportMode,
    readiness: {
      ...state.readiness,
      ...(partial.readiness ?? {}),
    },
    timestamps: {
      ...state.timestamps,
      lastStateChangeAt: Date.now(),
    },
  })),

  setConnectionState: (patch) => set((state) => ({
    connectionState: {
      ...state.connectionState,
      ...patch,
    },
    timestamps: {
      ...state.timestamps,
      lastStateChangeAt: Date.now(),
    },
  })),

  setStreamState: (patch) => set((state) => ({
    streamState: {
      ...state.streamState,
      ...patch,
    },
    timestamps: {
      ...state.timestamps,
      lastStateChangeAt: Date.now(),
    },
  })),

  registerPendingEvent: (eventMeta) => set((state) => {
    if (!eventMeta?.id) {
      return state
    }

    return {
      pendingEventsById: {
        ...state.pendingEventsById,
        [eventMeta.id]: {
          id: eventMeta.id,
          type: eventMeta.type ?? 'UNKNOWN',
          scope: eventMeta.scope ?? null,
          sessionId: eventMeta.sessionId ?? null,
          correlationId: eventMeta.correlationId ?? null,
          status: eventMeta.status ?? 'queued',
          createdAt: eventMeta.createdAt ?? Date.now(),
          receivedAt: eventMeta.receivedAt ?? null,
        },
      },
      pendingEventOrder: state.pendingEventOrder.includes(eventMeta.id)
        ? state.pendingEventOrder
        : [...state.pendingEventOrder, eventMeta.id],
      timestamps: {
        ...state.timestamps,
        lastEventAt: Date.now(),
        lastStateChangeAt: Date.now(),
      },
    }
  }),

  resolvePendingEvent: (eventId, status = 'processed') => set((state) => {
    const existing = state.pendingEventsById[eventId]

    if (!existing) {
      return state
    }

    return {
      pendingEventsById: {
        ...state.pendingEventsById,
        [eventId]: {
          ...existing,
          status,
          receivedAt: existing.receivedAt ?? Date.now(),
        },
      },
      timestamps: {
        ...state.timestamps,
        lastEventAt: Date.now(),
        lastStateChangeAt: Date.now(),
      },
    }
  }),

  prunePendingEvents: (keepIds = []) => set((state) => {
    const keepSet = new Set(keepIds)
    const pendingEventsById = Object.fromEntries(
      Object.entries(state.pendingEventsById).filter(([eventId]) => keepSet.has(eventId)),
    )

    return {
      pendingEventsById,
      pendingEventOrder: state.pendingEventOrder.filter((eventId) => keepSet.has(eventId)),
      timestamps: {
        ...state.timestamps,
        lastStateChangeAt: Date.now(),
      },
    }
  }),

  upsertActivityMeta: (activityId, patch) => set((state) => {
    if (!activityId) {
      return state
    }

    return {
      activityMetaById: {
        ...state.activityMetaById,
        [activityId]: {
          id: activityId,
          label: '',
          status: 'idle',
          sessionId: null,
          correlationId: null,
          updatedAt: Date.now(),
          ...state.activityMetaById[activityId],
          ...patch,
          updatedAt: Date.now(),
        },
      },
      timestamps: {
        ...state.timestamps,
        lastStateChangeAt: Date.now(),
      },
    }
  }),

  setDiagnosticState: (patch) => set((state) => ({
    connectionState: {
      ...state.connectionState,
      diagnosticCode: patch?.diagnosticCode ?? state.connectionState.diagnosticCode,
      diagnosticMessage: patch?.diagnosticMessage ?? state.connectionState.diagnosticMessage,
    },
    readiness: {
      ...state.readiness,
      ...(patch?.readiness ?? {}),
    },
    timestamps: {
      ...state.timestamps,
      lastDiagnosticAt: Date.now(),
      lastStateChangeAt: Date.now(),
    },
  })),

  resetRealtimeScope: () => set((state) => ({
    connectionState: {
      ...DEFAULT_CONNECTION_STATE,
    },
    streamState: {
      ...DEFAULT_STREAM_STATE,
    },
    pendingEventsById: {},
    pendingEventOrder: [],
    activityMetaById: {},
    streamBuffersByCorrelationId: {},
    subscriptionsByScope: {},
    readiness: {
      ...state.readiness,
    },
    timestamps: {
      ...state.timestamps,
      lastStateChangeAt: Date.now(),
    },
  })),
}))

export const selectConnectionState = (state) => state.connectionState
export const selectStreamState = (state) => state.streamState
export const selectPendingEvents = (state) => (
  state.pendingEventOrder.map((eventId) => state.pendingEventsById[eventId]).filter(Boolean)
)
export const selectRealtimeReadiness = (state) => state.readiness

export function syncRealtimeShadow(partial) {
  useRealtimeStore.getState().hydrateRealtimeReadiness(partial)
}
