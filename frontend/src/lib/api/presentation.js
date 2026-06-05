import { request } from '../http.js'

export const apiPresentationPlan        = (id, instructions = '', numSlides = 6) =>
  request('POST', '/api/presentations/plan', { body: { session_id: id, user_instructions: instructions, num_slides: numSlides } })
export const apiUpdatePresentationPlan  = (id, plan) =>
  request('PUT', '/api/presentations/plan', { params: { session_id: id }, body: { title: plan.title, slides: plan.slides } })
export const apiBuildPresentation       = (id, theme, slideIds) =>
  request('POST', '/api/presentations/build', { params: { session_id: id }, body: { theme, slide_ids: slideIds } })
export const apiPresentationThemes      = () => request('GET', '/api/presentations/themes')
export const apiDownloadPresentation    = id => request('GET', `/api/presentations/download/${id}`)
