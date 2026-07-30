import { request } from '../http.js'

export const apiChat           = (id, question) => request('POST', '/api/chat', { body: { session_id: id, question } })
export const apiCancelGeneration = (id) => request('POST', `/api/chat/cancel/${id}`)
export const apiTranslate      = (id, lang) => request('POST', '/api/translate', { body: { session_id: id, target_language: lang } })
export const apiTranslateExport = (id, lang, fmt) =>
  request('POST', '/api/translate/export', { params: { target_format: fmt }, body: { session_id: id, target_language: lang } })
