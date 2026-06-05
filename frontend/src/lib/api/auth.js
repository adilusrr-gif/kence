import { BASE, request, saveAuth, clearAuth, getStoredUser } from '../http.js'
export { saveAuth, clearAuth, getStoredUser }

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

export const apiRegister        = (username, password, role = 'user', adminToken = null) =>
  request('POST', '/api/auth/register', { body: { username, password, role, admin_token: adminToken } })
export const apiMe              = () => request('GET', '/api/auth/me')
export const apiChangePassword  = (cur, next) =>
  request('POST', '/api/auth/change-password', { body: { current_password: cur, new_password: next } })
export const apiAdminListUsers      = () => request('GET', '/api/auth/users')
export const apiAdminCreateUser     = (u, p, r) => request('POST', '/api/auth/users', { body: { username: u, password: p, role: r } })
export const apiAdminActivateUser   = u => request('POST', `/api/auth/users/${u}/activate`)
export const apiAdminDeactivateUser = u => request('POST', `/api/auth/users/${u}/deactivate`)
export const apiAdminDeleteUser     = u => request('DELETE', `/api/auth/users/${u}`)
export const apiAdminChangeRole     = (u, role) => request('PATCH', `/api/auth/users/${u}/role`, { body: { role } })
export const apiAdminStats          = () => request('GET', '/api/auth/stats')
export const apiRefreshToken        = () => request('POST', '/api/auth/refresh')
