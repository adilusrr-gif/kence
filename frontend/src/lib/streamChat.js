import { getBaseUrl } from './api'

const DEBUG = import.meta.env.DEV

/**
 * Streams a chat response via SSE.
 * @param {string} sessionId
 * @param {string} question
 * @param {{ onStatus, onChunk, onDone, onError }} callbacks
 */
export async function streamChat(sessionId, question, { onStatus, onChunk, onDone, onError, onSources, mode = 'precise', customUrl = null, signal = null }) {
  const BASE  = getBaseUrl()
  const token = localStorage.getItem('kence_token')
  const url   = customUrl ?? (`${BASE}/api/chat/stream?` + new URLSearchParams({ session_id: sessionId, question, mode }))

  if (DEBUG) console.debug('[streamChat] fetch', url)

  let res
  try {
    res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal,
    })
  } catch (e) {
    if (e.name === 'AbortError') return  // navigated away — silent
    onError?.(new Error('Failed to fetch: ' + e.message))
    return
  }

  if (res.status === 401) {
    localStorage.removeItem('kence_token')
    window.location.href = '/login'
    return
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    onError?.(new Error(err.detail || 'Ошибка сервера'))
    return
  }

  const reader  = res.body.getReader()
  const decoder = new TextDecoder()
  let fullText  = ''
  let buf       = ''
  let streamDone = false

  try {
    while (!streamDone) {
      const { done, value } = await reader.read()
      if (DEBUG) console.debug('[streamChat] read', { done, bytes: value?.length ?? 0 })
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6).trim()
        if (raw === '[DONE]') {
          if (DEBUG) console.debug('[streamChat] [DONE] received, fullText.length =', fullText.length)
          streamDone = true
          break
        }
        let parsed
        try {
          parsed = JSON.parse(raw)
        } catch (e) {
          console.warn('[streamChat] failed to parse SSE event, skipping', raw, e)
          continue
        }
        const { text, status, error, sources } = parsed
        if (DEBUG) console.debug('[streamChat] event', { status, error, hasSources: !!sources, textLen: text?.length })
        if (error) throw new Error(error)
        if (status) onStatus?.(status)
        if (sources) onSources?.(sources)
        if (text) {
          fullText += text
          onChunk?.(text, fullText)
        }
      }
    }
    if (DEBUG) console.debug('[streamChat] done, fullText.length =', fullText.length)
    onDone?.(fullText || '(пустой ответ)')
  } catch (e) {
    if (e.name === 'AbortError') return  // navigated away — silent
    if (DEBUG) console.debug('[streamChat] error', e)
    onError?.(e)
  } finally {
    try { reader.cancel() } catch { /* ignore */ }
  }
}
