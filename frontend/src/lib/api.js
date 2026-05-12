const BASE = window.location.origin === 'http://localhost:5173' ? 'http://127.0.0.1:8000' : ''

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

// ── Sessions ──────────────────────────────────────────────────────────────

export async function apiCreateSession() {
  return request('POST', '/api/sessions')
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

// ── Presentation ──────────────────────────────────────────────────────────

export async function apiGeneratePresentation(sessionId) {
  return request('POST', '/api/presentations/generate', { params: { session_id: sessionId } })
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
