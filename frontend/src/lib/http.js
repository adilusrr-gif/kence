const { hostname } = window.location
export const BASE = (hostname === 'localhost' || hostname === '127.0.0.1')
  ? `http://${hostname}:8000`
  : ''

export function getBaseUrl() { return BASE }

export function copyToClipboard(text) {
  navigator.clipboard.writeText(text).catch(() => {})
}

export function getToken() {
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

export async function request(method, path, { body, params, form } = {}) {
  const token = getToken()
  const headers = {}

  let url = BASE + path
  if (params) url += '?' + new URLSearchParams(params).toString()

  let bodyPayload
  if (form) {
    bodyPayload = form
  } else if (body) {
    headers['Content-Type'] = 'application/json'
    bodyPayload = JSON.stringify(body)
  }

  if (token) headers['Authorization'] = `Bearer ${token}`

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

export async function uploadForm(url, formData) {
  const token = getToken()
  const res = await fetch(BASE + url, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })
  if (res.status === 401) { clearAuth(); window.location.href = '/login' }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Ошибка загрузки')
  }
  return res.json()
}
