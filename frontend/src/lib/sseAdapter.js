import { streamChat } from './streamChat'
import { useEventStore } from '@/shared/stores/eventStore'

/**
 * Wraps streamChat with eventStore dispatch.
 * Fires CHAT_STREAMING at start, CHAT_COMPLETE on done, CHAT_ERROR on error.
 * Does NOT dispatch on individual tokens to avoid re-render floods.
 */
export function streamWithEvents(sessionId, question, handlers = {}) {
  useEventStore.getState().ingestEvent({
    type: 'CHAT_STREAMING',
    message: 'Streaming response…',
    sessionId,
  })

  return streamChat(sessionId, question, {
    mode: handlers.mode,
    customUrl: handlers.customUrl,
    onStatus: handlers.onStatus,
    onChunk: handlers.onChunk,
    onSources: handlers.onSources,
    onDone: (fullText) => {
      useEventStore.getState().ingestEvent({
        type: 'CHAT_COMPLETE',
        message: 'Response complete',
        sessionId,
      })
      handlers.onDone?.(fullText)
    },
    onError: (err) => {
      useEventStore.getState().ingestEvent({
        type: 'CHAT_ERROR',
        message: err?.message || 'Stream error',
        sessionId,
      })
      handlers.onError?.(err)
    },
  })
}
