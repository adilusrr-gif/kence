import { getBaseUrl } from './api'

/**
 * Streams a chat response via SSE.
 * @param {string} sessionId
 * @param {string} question
 * @param {{ onStatus, onChunk, onDone, onError }} callbacks
 */
export async function streamChat(sessionId, question, { onStatus, onChunk, onDone, onError }) {
  const BASE  = getBaseUrl()
  const token = localStorage.getItem('kence_token')
  const url   = `${BASE}/api/chat/stream?` + new URLSearchParams({ session_id: sessionId, question })

  let res
  try {
    res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  } catch (e) {
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

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6).trim()
        if (raw === '[DONE]') break
        try {
          const { text, status, error } = JSON.parse(raw)
          if (error) throw new Error(error)
          if (status) onStatus?.(status)
          if (text) {
            fullText += text
            onChunk?.(text, fullText)
          }
        } catch (e) {
          if (e.message !== 'Unexpected end') throw e
        }
      }
    }
    onDone?.(fullText || '(пустой ответ)')
  } catch (e) {
    onError?.(e)
  }
}
