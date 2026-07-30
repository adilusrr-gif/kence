import { create } from 'zustand'
import { apiGetMyOrgs } from '../../lib/api'

const LS_KEY = 'kence_current_org'
const LS_SLUG_KEY = 'kence_current_org_slug'

const useOrgStore = create((set, get) => ({
  currentOrgId: null,
  currentOrgSlug: null,
  currentOrgName: null,
  currentOrgPlan: null,
  orgs: [],
  orgsLoaded: false,

  fetchMyOrgs: async () => {
    try {
      const orgs = await apiGetMyOrgs()
      set({ orgs })
      // Restore persisted org or default to first
      const saved = localStorage.getItem(LS_KEY)
      const savedId = saved ? parseInt(saved, 10) : null
      const found = savedId ? orgs.find(o => o.id === savedId) : orgs[0]
      if (found) {
        set({
          currentOrgId: found.id,
          currentOrgSlug: found.slug,
          currentOrgName: found.display_name,
          currentOrgPlan: found.plan ?? 'free',
        })
        localStorage.setItem(LS_SLUG_KEY, found.slug)
      }
    } catch {
      // Non-fatal — user may not belong to any org yet
    } finally {
      set({ orgsLoaded: true })
    }
  },

  switchOrg: (org) => {
    localStorage.setItem(LS_KEY, String(org.id))
    localStorage.setItem(LS_SLUG_KEY, org.slug)
    set({
      currentOrgId: org.id,
      currentOrgSlug: org.slug,
      currentOrgName: org.display_name,
      currentOrgPlan: org.plan ?? 'free',
    })
  },

  clearOrg: () => {
    localStorage.removeItem(LS_KEY)
    set({ currentOrgId: null, currentOrgSlug: null, currentOrgName: null, currentOrgPlan: null, orgs: [] })
  },
}))

export default useOrgStore
