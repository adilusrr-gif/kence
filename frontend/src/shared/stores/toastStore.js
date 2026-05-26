import { create } from 'zustand'

let _id = 1

export const useToastStore = create((set) => ({
  toasts: [],

  addToast: (type, message, duration = 4000) => {
    const id = `toast-${Date.now()}-${_id++}`
    set((state) => ({ toasts: [...state.toasts, { id, type, message, duration }] }))
    return id
  },

  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter((t) => t.id !== id),
  })),
}))
