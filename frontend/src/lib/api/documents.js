import { BASE, request, uploadForm, getToken } from '../http.js'

export const apiUploadDocument     = (sessionId, file) => {
  const form = new FormData()
  form.append('file', file)
  return uploadForm(`/api/documents/upload?session_id=${sessionId}`, form)
}
export const apiGetDocumentContent = id => request('GET', `/api/documents/${id}/content`)
export const apiVisualDescribe     = id => request('GET', `/api/documents/${id}/visual-describe`)
export const apiVisionStatus       = () => request('GET', '/api/vision/status')
export const apiConvert            = (id, fmt) => request('POST', '/api/documents/convert', { params: { session_id: id, target_format: fmt } })
export const apiDownloadConverted  = (id, fmt) => request('GET', `/api/documents/converted/${id}/${fmt}`)
export const apiDownloadPath       = path => request('GET', path)

export const apiSaveMarkdown = (sessionId, markdown) =>
  request('PUT', `/api/documents/content/${sessionId}`, { body: { markdown } })

export async function apiExportMarkdown(sessionId, markdown, format) {
  const token = getToken()
  const res = await fetch('/api/documents/export-markdown', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ session_id: sessionId, markdown, format }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.blob()
}

export function apiDocumentImageUrl(sessionId) {
  const token = getToken() || ''
  return `${BASE}/api/documents/${sessionId}/image?token=${encodeURIComponent(token)}`
}
