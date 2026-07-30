import { request } from '../http.js'

// Available to every authenticated user — just their own upload count.
export const apiAnalyticsMy       = ()             => request('GET', '/api/analytics/my')
// Admin-only — full breakdown across all users.
export const apiAnalyticsOverview = ()             => request('GET', '/api/analytics/overview')
export const apiAnalyticsTimeline = (days = 7)     => request('GET', '/api/analytics/timeline', { params: { days } })
export const apiAnalyticsFormats  = ()             => request('GET', '/api/analytics/formats')
export const apiAnalyticsEvents   = (limit = 20)   => request('GET', '/api/analytics/events', { params: { limit } })
