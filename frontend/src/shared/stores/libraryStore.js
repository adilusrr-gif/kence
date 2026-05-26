import { create } from 'zustand'
import { apiGetLibrary, apiAddToLibrary, apiDeleteLibraryDoc } from '../../lib/api'

const useLibraryStore = create((set, get) => ({
  docs: [],
  loading: false,
  error: null,
  searchQuery: '',
  activeTags: [],

  fetchLibrary: async (orgId) => {
    set({ loading: true, error: null })
    try {
      const docs = await apiGetLibrary(orgId)
      set({ docs, loading: false })
    } catch (e) {
      set({ error: e.message, loading: false })
    }
  },

  addDoc: async (orgId, sessionId, name, description, tags) => {
    const doc = await apiAddToLibrary(orgId, { session_id: sessionId, name, description, tags })
    set(s => ({ docs: [doc, ...s.docs] }))
    return doc
  },

  removeDoc: async (orgId, docId) => {
    await apiDeleteLibraryDoc(orgId, docId)
    set(s => ({ docs: s.docs.filter(d => d.id !== docId) }))
  },

  setSearch: (q) => set({ searchQuery: q }),
  toggleTag: (tag) => set(s => ({
    activeTags: s.activeTags.includes(tag)
      ? s.activeTags.filter(t => t !== tag)
      : [...s.activeTags, tag]
  })),
}))

export default useLibraryStore
