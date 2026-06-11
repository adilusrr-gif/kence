import { request } from '../http.js'

export const apiImageGenStatus  = () => request('GET', '/api/images/status')
export const apiImageOptions    = () => request('GET', '/api/images/options')
export const apiGenerateImage   = (payload) => request('POST', '/api/images/generate', { body: payload })
export const apiListImages      = () => request('GET', '/api/images')
export const apiDeleteImage     = (id) => request('DELETE', `/api/images/${id}`)
export const apiGetImageBlob    = (id) => request('GET', `/api/images/${id}/file`)
