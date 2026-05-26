import { create } from 'zustand'

export const useEventStore = create((set) => ({
  latestMessage: '',
  ingestionStatus: 'idle', // 'idle' | 'active' | 'error'
  recentEvents: [],

  ingestEvent: ({ type, message, sessionId }) => set((state) => {
    const event = { type, message, sessionId, timestamp: Date.now() }
    const status =
      type.endsWith('_ERROR') ? 'error' :
      type.endsWith('_COMPLETE') || type.endsWith('_READY') ? 'idle' :
      'active'
    return {
      latestMessage: message || state.latestMessage,
      ingestionStatus: status,
      recentEvents: [event, ...state.recentEvents].slice(0, 20),
    }
  }),

  setStatus: (ingestionStatus) => set({ ingestionStatus }),

  clearEvents: () => set({ latestMessage: '', ingestionStatus: 'idle', recentEvents: [] }),
}))
