/**
 * Derives product feature flags from the current org's plan.
 * Plan is already in orgStore — no separate API call needed.
 *
 * Plans: 'free' | 'pro' | 'enterprise' | 'gov'
 */
import useOrgStore from './orgStore'

function flagsFromPlan(plan) {
  const p = (plan || 'free').toLowerCase()
  return {
    // UX mode
    govUx:              p === 'gov',
    // Intelligence features
    knowledgeGraph:     p === 'enterprise' || p === 'gov',
    fullAgents:         p === 'enterprise' || p === 'gov',
    documentLibrary:    p === 'enterprise' || p === 'gov',
    executiveDashboard: p === 'enterprise' || p === 'gov',
    aiSettings:         p === 'enterprise' || p === 'gov',
    analytics:          p === 'pro' || p === 'enterprise' || p === 'gov',
    // Enterprise-only
    customPrompts:      p === 'enterprise',
    batchAgents:        p === 'enterprise',
    biExport:           p === 'enterprise',
    // Gov-only
    classifiedMode:     p === 'gov',
    auditTrail:         p === 'enterprise' || p === 'gov',
    complianceExport:   p === 'gov',
    watermarkDownloads: p === 'gov',
  }
}

/** React hook — re-renders when org plan changes (e.g. org switch). */
export function useFeatureFlags() {
  const plan = useOrgStore((s) => s.currentOrgPlan)
  return flagsFromPlan(plan)
}

/** Non-hook — use in event handlers, utilities, etc. */
export function getFeatureFlags(plan) {
  return flagsFromPlan(plan)
}
