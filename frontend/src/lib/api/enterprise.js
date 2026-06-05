import { BASE, request, getToken } from '../http.js'

// ── AI Settings ───────────────────────────────────────────────────────────────
export const apiGetPrompts          = ()          => request('GET', '/api/ai-settings/prompts')
export const apiUpdatePrompt        = (t, c)      => request('PUT', `/api/ai-settings/prompts/${t}`, { body: { content: c } })
export const apiResetPrompt         = t           => request('POST', `/api/ai-settings/prompts/${t}/reset`)
export const apiResetAllPrompts     = ()          => request('POST', '/api/ai-settings/prompts/reset-all')
export const apiGetDocumentContext  = name        => request('GET', '/api/ai-settings/document-context', { params: { document_name: name } })
export const apiSaveDocumentContext = (name, ctx) => request('POST', '/api/ai-settings/document-context', { body: { document_name: name, context: ctx } })
export const apiDeleteDocumentContext = name      => request('DELETE', '/api/ai-settings/document-context', { params: { document_name: name } })
export const apiGetDocumentContexts = ()          => request('GET', '/api/ai-settings/document-contexts')

// ── Organizations ─────────────────────────────────────────────────────────────
export const apiGetMyOrgs           = ()              => request('GET', '/api/orgs/me')
export const apiGetOrg              = id              => request('GET', `/api/orgs/${id}`)
export const apiCreateOrg           = data            => request('POST', '/api/orgs', { body: data })
export const apiUpdateOrg           = (id, data)      => request('PATCH', `/api/orgs/${id}`, { body: data })
export const apiGetOrgMembers       = id              => request('GET', `/api/orgs/${id}/members`)
export const apiAddOrgMember        = (id, data)      => request('POST', `/api/orgs/${id}/members`, { body: data })
export const apiRemoveOrgMember     = (id, u)         => request('DELETE', `/api/orgs/${id}/members/${u}`)
export const apiChangeOrgMemberRole = (id, u, role)   => request('PATCH', `/api/orgs/${id}/members/${u}/role`, { body: { org_role: role } })
export const apiGetOrgQuota         = id              => request('GET', `/api/orgs/${id}/quota`)
export const apiGetOrgApiKeys       = id              => request('GET', `/api/orgs/${id}/api-keys`)
export const apiCreateOrgApiKey     = (id, data)      => request('POST', `/api/orgs/${id}/api-keys`, { body: data })
export const apiRevokeOrgApiKey     = (id, key)       => request('DELETE', `/api/orgs/${id}/api-keys/${key}`)

// ── Library ───────────────────────────────────────────────────────────────────
export const apiGetLibrary          = (id, search, tags) =>
  request('GET', `/api/orgs/${id}/library`, { params: { ...(search && { search }), ...(tags && { tags }) } })
export const apiAddToLibrary        = (id, data)  => request('POST', `/api/orgs/${id}/library`, { body: data })
export const apiDeleteLibraryDoc    = (id, doc)   => request('DELETE', `/api/orgs/${id}/library/${doc}`)
export const apiDownloadLibraryDoc  = (id, doc)   => `${BASE}/api/orgs/${id}/library/${doc}/download`
export const apiOpenLibraryDocInSession = (id, doc) => request('POST', `/api/orgs/${id}/library/${doc}/open-session`)

// ── Sharing ───────────────────────────────────────────────────────────────────
export const apiGetSessionShares = id          => request('GET', `/api/sessions/${id}/shares`)
export const apiShareSession     = (id, data)  => request('POST', `/api/sessions/${id}/shares`, { body: data })
export const apiRevokeShare      = (id, share) => request('DELETE', `/api/sessions/${id}/shares/${share}`)
export const apiGetSharedWithMe  = orgId       => request('GET', '/api/sessions/shared-with-me', { params: { org_id: orgId } })

// ── Branding ──────────────────────────────────────────────────────────────────
export const apiGetPublicBranding  = slug        => fetch(`${BASE}/api/branding/${slug}`).then(r => r.json())
export const apiGetOrgBranding     = id          => request('GET', `/api/orgs/${id}/branding`)
export const apiUpdateOrgBranding  = (id, data)  => request('PUT', `/api/orgs/${id}/branding`, { body: data })

// ── Executive Dashboard ───────────────────────────────────────────────────────
export const apiGetKPI      = (id, period = 'day')        => request('GET', `/api/orgs/${id}/executive/kpi`, { params: { period } })
export const apiGetKPITrend = (id, period = 'day', n = 7) => request('GET', `/api/orgs/${id}/executive/trend`, { params: { period, n } })
export const apiExportReport = (id, period, format) =>
  `${BASE}/api/orgs/${id}/executive/export?period=${period}&format=${format}&token=${getToken()}`

// ── Knowledge Graph ───────────────────────────────────────────────────────────
export const apiTriggerExtraction = (orgId, session_id, language = 'ru') =>
  request('POST', `/api/orgs/${orgId}/graph/extract`, { body: { session_id, language } })
export const apiGetExtractionJob  = (orgId, jobId)    => request('GET', `/api/orgs/${orgId}/graph/jobs/${jobId}`)
export const apiGetGraphNodes     = (orgId, type)     => request('GET', `/api/orgs/${orgId}/graph/nodes`, { params: type ? { entity_type: type } : {} })
export const apiExportGraph       = orgId             => request('GET', `/api/orgs/${orgId}/graph/export`)
export const apiQueryGraph        = (orgId, query)    => request('POST', `/api/orgs/${orgId}/graph/query`, { body: { query } })
export const apiDeleteGraph       = orgId             => request('DELETE', `/api/orgs/${orgId}/graph`)

// ── Agents ────────────────────────────────────────────────────────────────────
export const apiGetAgentTypes   = ()        => request('GET', '/api/agents/types')
export const apiCreateAgentTask = data      => request('POST', '/api/agents/tasks', { body: data })
export const apiGetAgentTasks   = orgId     => request('GET', '/api/agents/tasks', { params: orgId ? { org_id: orgId } : {} })
export const apiGetAgentTask    = id        => request('GET', `/api/agents/tasks/${id}`)
export const apiCancelAgentTask = id        => request('DELETE', `/api/agents/tasks/${id}`)
export const apiAgentTaskStreamUrl = id => {
  const token = getToken() || ''
  return `${BASE}/api/agents/tasks/${id}/stream?token=${encodeURIComponent(token)}`
}
