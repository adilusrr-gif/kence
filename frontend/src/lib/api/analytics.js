import { request } from '../http.js'

export const apiAnalyticsOverview = ()             => request('GET', '/api/analytics/overview')
export const apiAnalyticsTimeline = (days = 7)     => request('GET', '/api/analytics/timeline', { params: { days } })
export const apiAnalyticsFormats  = ()             => request('GET', '/api/analytics/formats')
export const apiAnalyticsEvents   = (limit = 20)   => request('GET', '/api/analytics/events', { params: { limit } })
