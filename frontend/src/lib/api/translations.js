import { request, BASE, getToken } from '../http.js'

// ── Background translation jobs (PART 2) ─────────────────────────────────────
export const apiCreateTranslation = (sessionId, targetLanguage, sourceLanguage = null) =>
  request('POST', '/api/translations', {
    body: { session_id: sessionId, target_language: targetLanguage, source_language: sourceLanguage },
  })

export const apiListTranslations = (limit = 50) =>
  request('GET', '/api/translations', { params: { limit } })

export const apiGetTranslation = (jobId) =>
  request('GET', `/api/translations/${jobId}`)

export const apiDeleteTranslation = (jobId) =>
  request('DELETE', `/api/translations/${jobId}`)

// Download formats: pdf | docx | txt | md | html (PART 3)
export const TRANSLATION_FORMATS = ['pdf', 'docx', 'txt', 'md', 'html']

// Triggers an authenticated download in the browser (fetch + blob, because the
// endpoint needs the Authorization header).
export async function downloadTranslation(jobId, fmt) {
  const res = await fetch(`${BASE}/api/translations/${jobId}/download/${fmt}`, {
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Ошибка скачивания')
  }
  const blob = await res.blob()
  const cd = res.headers.get('content-disposition') || ''
  const m = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
  const filename = m ? decodeURIComponent(m[1]) : `translation_${jobId}.${fmt}`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
