const { hostname } = window.location
const BASE = (hostname === 'localhost' || hostname === '127.0.0.1')
  ? `http://${hostname}:8000`
  : ''

export function getBaseUrl() { return BASE }

export function copyToClipboard(text) {
  navigator.clipboard.writeText(text).catch(() => {})
}

function getToken() {
  return localStorage.getItem('kence_token')
}

export function saveAuth(token, username, role) {
  localStorage.setItem('kence_token', token)
  localStorage.setItem('kence_user', username)
  localStorage.setItem('kence_role', role)
}

export function clearAuth() {
  localStorage.removeItem('kence_token')
  localStorage.removeItem('kence_user')
  localStorage.removeItem('kence_role')
}

export function getStoredUser() {
  const token = getToken()
  if (!token) return null
  return {
    token,
    username: localStorage.getItem('kence_user') || '',
    role: localStorage.getItem('kence_role') || 'user',
  }
}

async function request(method, path, { body, params, form } = {}) {
  const token = getToken()
  const headers = {}

  let url = BASE + path
  if (params) {
    url += '?' + new URLSearchParams(params).toString()
  }

  let bodyPayload
  if (form) {
    bodyPayload = form
  } else if (body) {
    headers['Content-Type'] = 'application/json'
    bodyPayload = JSON.stringify(body)
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(url, { method, headers, body: bodyPayload })

  if (res.status === 401) {
    clearAuth()
    window.location.href = '/login'
    throw new Error('Сессия истекла. Войдите снова.')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Ошибка сервера')
  }

  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.json()
  return res.blob()
}

// ── Auth ──────────────────────────────────────────────────────────────────

export async function apiLogin(username, password) {
  const form = new URLSearchParams({ username, password })
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Ошибка входа' }))
    throw new Error(err.detail || 'Ошибка входа')
  }
  return res.json()
}

export async function apiRegister(username, password, role = 'user', adminToken = null) {
  return request('POST', '/api/auth/register', {
    body: { username, password, role, admin_token: adminToken },
  })
}

export async function apiMe() {
  return request('GET', '/api/auth/me')
}

export async function apiChangePassword(currentPassword, newPassword) {
  return request('POST', '/api/auth/change-password', {
    body: { current_password: currentPassword, new_password: newPassword },
  })
}

export async function apiAdminListUsers() {
  return request('GET', '/api/auth/users')
}

export async function apiAdminCreateUser(username, password, role) {
  return request('POST', '/api/auth/users', { body: { username, password, role } })
}

export async function apiAdminActivateUser(username) {
  return request('POST', `/api/auth/users/${username}/activate`)
}

export async function apiAdminDeactivateUser(username) {
  return request('POST', `/api/auth/users/${username}/deactivate`)
}

export async function apiAdminDeleteUser(username) {
  return request('DELETE', `/api/auth/users/${username}`)
}

export async function apiAdminChangeRole(username, role) {
  return request('PATCH', `/api/auth/users/${username}/role`, { body: { role } })
}

export async function apiAdminStats() {
  return request('GET', '/api/auth/stats')
}

// ── Sessions ──────────────────────────────────────────────────────────────

export async function apiCreateSession() {
  return request('POST', '/api/sessions')
}

export async function apiDeleteSession(sessionId) {
  return request('DELETE', `/api/sessions/${sessionId}`)
}

// ── Chat History ──────────────────────────────────────────────────────────

export async function apiGetChatHistory(sessionId, limit = 20) {
  return request('GET', `/api/chat/history/${sessionId}`, { params: { limit } })
}

export async function apiClearChatHistory(sessionId) {
  return request('DELETE', `/api/chat/history/${sessionId}`)
}

// ── Documents ─────────────────────────────────────────────────────────────

export async function apiUploadDocument(sessionId, file) {
  const token = getToken()
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/api/documents/upload?session_id=${sessionId}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  if (res.status === 401) { clearAuth(); window.location.href = '/login' }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Ошибка загрузки')
  }
  return res.json()
}

// ── Chat ─────────────────────────────────────────────────────────────────

export async function apiChat(sessionId, question) {
  return request('POST', '/api/chat', { body: { session_id: sessionId, question } })
}

// ── Translate ─────────────────────────────────────────────────────────────

export async function apiTranslate(sessionId, targetLanguage) {
  return request('POST', '/api/translate', {
    body: { session_id: sessionId, target_language: targetLanguage },
  })
}

export async function apiTranslateExport(sessionId, targetLanguage, targetFormat) {
  return request('POST', '/api/translate/export', {
    params: { target_format: targetFormat },
    body: { session_id: sessionId, target_language: targetLanguage },
  })
}

export async function apiDownloadPath(path) {
  return request('GET', path)
}

// ── Document Content ──────────────────────────────────────────────────────

export async function apiGetDocumentContent(sessionId) {
  return request('GET', `/api/documents/${sessionId}/content`)
}

// ── Presentation (wizard) ─────────────────────────────────────────────────

export async function apiPresentationPlan(sessionId, userInstructions = '', numSlides = 6) {
  return request('POST', '/api/presentations/plan', {
    body: { session_id: sessionId, user_instructions: userInstructions, num_slides: numSlides },
  })
}

export async function apiUpdatePresentationPlan(sessionId, plan) {
  return request('PUT', '/api/presentations/plan', {
    params: { session_id: sessionId },
    body: { title: plan.title, slides: plan.slides },
  })
}

export async function apiBuildPresentation(sessionId, theme, slideIds) {
  return request('POST', '/api/presentations/build', {
    params: { session_id: sessionId },
    body: { theme, slide_ids: slideIds },
  })
}

export async function apiPresentationThemes() {
  return request('GET', '/api/presentations/themes')
}

export async function apiDownloadPresentation(sessionId) {
  return request('GET', `/api/presentations/download/${sessionId}`)
}

// ── Convert ───────────────────────────────────────────────────────────────

export async function apiConvert(sessionId, targetFormat) {
  return request('POST', '/api/documents/convert', {
    params: { session_id: sessionId, target_format: targetFormat },
  })
}

export async function apiDownloadConverted(sessionId, fmt) {
  return request('GET', `/api/documents/converted/${sessionId}/${fmt}`)
}

// ── Compare ───────────────────────────────────────────────────────────────

export async function apiCompareUpload(sessionId, file1, file2) {
  const token = getToken()
  const form = new FormData()
  form.append('file1', file1)
  form.append('file2', file2)
  const res = await fetch(`${BASE}/api/compare/upload?session_id=${sessionId}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  if (res.status === 401) { clearAuth(); window.location.href = '/login' }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Ошибка загрузки')
  }
  return res.json()
}

export async function apiCompareSemantic(sessionId) {
  return request('POST', '/api/compare/semantic', { params: { session_id: sessionId } })
}

export async function apiCompareTechnical(sessionId) {
  return request('POST', '/api/compare/technical', { params: { session_id: sessionId } })
}

export async function apiCompareExact(sessionId) {
  return request('POST', '/api/compare/exact', { params: { session_id: sessionId } })
}

// ── Analytics ─────────────────────────────────────────────────────────────

export async function apiAnalyticsOverview() {
  return request('GET', '/api/analytics/overview')
}

export async function apiAnalyticsTimeline(days = 7) {
  return request('GET', '/api/analytics/timeline', { params: { days } })
}

export async function apiAnalyticsFormats() {
  return request('GET', '/api/analytics/formats')
}

export async function apiAnalyticsEvents(limit = 20) {
  return request('GET', '/api/analytics/events', { params: { limit } })
}

// ── Vision (multimodal) ───────────────────────────────────────────────────

export async function apiVisionStatus() {
  return request('GET', '/api/vision/status')
}

export async function apiVisualDescribe(sessionId) {
  return request('GET', `/api/documents/${sessionId}/visual-describe`)
}

// ── AI Settings (Admin: prompts) ──────────────────────────────────────────

export async function apiGetPrompts() {
  return request('GET', '/api/ai-settings/prompts')
}

export async function apiUpdatePrompt(promptType, content) {
  return request('PUT', `/api/ai-settings/prompts/${promptType}`, { body: { content } })
}

export async function apiResetPrompt(promptType) {
  return request('POST', `/api/ai-settings/prompts/${promptType}/reset`)
}

export async function apiResetAllPrompts() {
  return request('POST', '/api/ai-settings/prompts/reset-all')
}

// ── AI Settings (Users: document contexts) ───────────────────────────────

export async function apiGetDocumentContext(documentName) {
  return request('GET', '/api/ai-settings/document-context', { params: { document_name: documentName } })
}

export async function apiSaveDocumentContext(documentName, context) {
  return request('POST', '/api/ai-settings/document-context', {
    body: { document_name: documentName, context },
  })
}

export async function apiDeleteDocumentContext(documentName) {
  return request('DELETE', '/api/ai-settings/document-context', { params: { document_name: documentName } })
}

export async function apiGetDocumentContexts() {
  return request('GET', '/api/ai-settings/document-contexts')
}

// ── Enterprise E1: Organizations ─────────────────────────────────────────────
export const apiGetMyOrgs = () => request('GET', '/api/orgs/me')
export const apiGetOrg = (orgId) => request('GET', `/api/orgs/${orgId}`)
export const apiCreateOrg = (data) => request('POST', '/api/orgs', { body: data })
export const apiUpdateOrg = (orgId, data) => request('PATCH', `/api/orgs/${orgId}`, { body: data })
export const apiGetOrgMembers = (orgId) => request('GET', `/api/orgs/${orgId}/members`)
export const apiAddOrgMember = (orgId, data) => request('POST', `/api/orgs/${orgId}/members`, { body: data })
export const apiRemoveOrgMember = (orgId, username) => request('DELETE', `/api/orgs/${orgId}/members/${username}`)
export const apiChangeOrgMemberRole = (orgId, username, org_role) => request('PATCH', `/api/orgs/${orgId}/members/${username}/role`, { body: { org_role } })
export const apiGetOrgQuota = (orgId) => request('GET', `/api/orgs/${orgId}/quota`)
export const apiGetOrgApiKeys = (orgId) => request('GET', `/api/orgs/${orgId}/api-keys`)
export const apiCreateOrgApiKey = (orgId, data) => request('POST', `/api/orgs/${orgId}/api-keys`, { body: data })
export const apiRevokeOrgApiKey = (orgId, keyId) => request('DELETE', `/api/orgs/${orgId}/api-keys/${keyId}`)

// ── Enterprise E2: Library ────────────────────────────────────────────────────
export const apiGetLibrary = (orgId, search, tags) => request('GET', `/api/orgs/${orgId}/library`, { params: { ...(search && { search }), ...(tags && { tags }) } })
export const apiAddToLibrary = (orgId, data) => request('POST', `/api/orgs/${orgId}/library`, { body: data })
export const apiDeleteLibraryDoc = (orgId, docId) => request('DELETE', `/api/orgs/${orgId}/library/${docId}`)
export const apiDownloadLibraryDoc = (orgId, docId) => `${BASE}/api/orgs/${orgId}/library/${docId}/download`
export const apiOpenLibraryDocInSession = (orgId, docId) => request('POST', `/api/orgs/${orgId}/library/${docId}/open-session`)

// ── Enterprise E2: Sharing ────────────────────────────────────────────────────
export const apiGetSessionShares = (sessionId) => request('GET', `/api/sessions/${sessionId}/shares`)
export const apiShareSession = (sessionId, data) => request('POST', `/api/sessions/${sessionId}/shares`, { body: data })
export const apiRevokeShare = (sessionId, shareId) => request('DELETE', `/api/sessions/${sessionId}/shares/${shareId}`)
export const apiGetSharedWithMe = (orgId) => request('GET', '/api/sessions/shared-with-me', { params: { org_id: orgId } })

// ── Enterprise E2: Branding ───────────────────────────────────────────────────
export const apiGetPublicBranding = (slug) => fetch(`${BASE}/api/branding/${slug}`).then(r => r.json())
export const apiGetOrgBranding = (orgId) => request('GET', `/api/orgs/${orgId}/branding`)
export const apiUpdateOrgBranding = (orgId, data) => request('PUT', `/api/orgs/${orgId}/branding`, { body: data })

// ── Enterprise E2: Executive Dashboard ───────────────────────────────────────
export const apiGetKPI = (orgId, period = 'day') => request('GET', `/api/orgs/${orgId}/executive/kpi`, { params: { period } })
export const apiGetKPITrend = (orgId, period = 'day', n = 7) => request('GET', `/api/orgs/${orgId}/executive/trend`, { params: { period, n } })
export const apiExportReport = (orgId, period, format) => `${BASE}/api/orgs/${orgId}/executive/export?period=${period}&format=${format}&token=${getToken()}`

// ── Enterprise E3: Knowledge Graph ───────────────────────────────────────────
export const apiTriggerExtraction = (orgId, session_id) => request('POST', `/api/orgs/${orgId}/graph/extract`, { body: { session_id } })
export const apiGetExtractionJob = (orgId, jobId) => request('GET', `/api/orgs/${orgId}/graph/jobs/${jobId}`)
export const apiGetGraphNodes = (orgId, entity_type) => request('GET', `/api/orgs/${orgId}/graph/nodes`, { params: entity_type ? { entity_type } : {} })
export const apiExportGraph = (orgId) => request('GET', `/api/orgs/${orgId}/graph/export`)
export const apiQueryGraph = (orgId, query) => request('POST', `/api/orgs/${orgId}/graph/query`, { body: { query } })
export const apiDeleteGraph = (orgId) => request('DELETE', `/api/orgs/${orgId}/graph`)

// ── Enterprise E4: Agents ─────────────────────────────────────────────────────
export const apiGetAgentTypes = () => request('GET', '/api/agents/types')
export const apiCreateAgentTask = (data) => request('POST', '/api/agents/tasks', { body: data })
export const apiGetAgentTasks = (orgId) => request('GET', '/api/agents/tasks', { params: orgId ? { org_id: orgId } : {} })
export const apiGetAgentTask = (taskId) => request('GET', `/api/agents/tasks/${taskId}`)
export const apiCancelAgentTask = (taskId) => request('DELETE', `/api/agents/tasks/${taskId}`)
export const apiAgentTaskStreamUrl = (taskId) => {
  const token = localStorage.getItem('kence_token') || ''
  return `${BASE}/api/agents/tasks/${taskId}/stream?token=${encodeURIComponent(token)}`
}
