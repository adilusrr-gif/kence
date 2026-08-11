import { request } from '../http.js'

export const apiCreateSession      = () => request('POST', '/api/sessions')
export const apiListSessions       = (params = {}) => request('GET', '/api/sessions', { params })
export const apiDeleteSession      = id => request('DELETE', `/api/sessions/${id}`)
export const apiGetChatHistory     = (id, limit = 20) => request('GET', `/api/chat/history/${id}`, { params: { limit } })
export const apiClearChatHistory   = id => request('DELETE', `/api/chat/history/${id}`)
