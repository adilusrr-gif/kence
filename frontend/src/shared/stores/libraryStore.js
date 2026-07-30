import { create } from 'zustand'
import {
  apiGetLibrary, apiAddToLibrary, apiUploadToLibrary, apiUpdateLibraryDoc, apiDeleteLibraryDoc,
  apiGetTaxonomy, apiAddTaxonomy, apiDeleteTaxonomy,
} from '../../lib/api'

const useLibraryStore = create((set, get) => ({
  docs: [],
  loading: false,
  error: null,
  // Filters: searchQuery is client-side; docKind/direction/issuer are server-side.
  searchQuery: '',
  docKind: '',        // '' | 'document' | 'npa'
  direction: '',
  issuer: '',
  taxonomy: { direction: [], issuer: [] },

  fetchLibrary: async (orgId) => {
    const { docKind, direction, issuer } = get()
    set({ loading: true, error: null })
    try {
      const docs = await apiGetLibrary(orgId, { doc_kind: docKind, direction, issuer })
      set({ docs, loading: false })
    } catch (e) {
      set({ error: e.message, loading: false })
    }
  },

  fetchTaxonomy: async (orgId) => {
    try {
      const tax = await apiGetTaxonomy(orgId)
      set({ taxonomy: { direction: tax.direction || [], issuer: tax.issuer || [] } })
    } catch { /* non-fatal */ }
  },

  addDoc: async (orgId, payload) => {
    const doc = await apiAddToLibrary(orgId, payload)
    set(s => ({ docs: [doc, ...s.docs] }))
    return doc
  },

  uploadDoc: async (orgId, formData) => {
    const doc = await apiUploadToLibrary(orgId, formData)
    set(s => ({ docs: [doc, ...s.docs] }))
    return doc
  },

  updateDoc: async (orgId, docId, fields) => {
    const updated = await apiUpdateLibraryDoc(orgId, docId, fields)
    set(s => ({ docs: s.docs.map(d => (d.id === docId ? updated : d)) }))
    return updated
  },

  removeDoc: async (orgId, docId) => {
    await apiDeleteLibraryDoc(orgId, docId)
    set(s => ({ docs: s.docs.filter(d => d.id !== docId) }))
  },

  addTaxonomy: async (orgId, kind, value) => {
    const row = await apiAddTaxonomy(orgId, kind, value)
    set(s => ({ taxonomy: { ...s.taxonomy, [kind]: [...(s.taxonomy[kind] || []), row].sort((a, b) => a.value.localeCompare(b.value)) } }))
    return row
  },

  removeTaxonomy: async (orgId, kind, taxId) => {
    await apiDeleteTaxonomy(orgId, taxId)
    set(s => ({ taxonomy: { ...s.taxonomy, [kind]: (s.taxonomy[kind] || []).filter(r => r.id !== taxId) } }))
  },

  setSearch: (q) => set({ searchQuery: q }),
  setDocKind: (k) => set({ docKind: k }),
  setDirection: (d) => set({ direction: d }),
  setIssuer: (i) => set({ issuer: i }),
}))

export default useLibraryStore
