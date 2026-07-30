export { ToastContainer } from './Toast'
export { useToastStore } from '@/shared/stores/toastStore'

import { useMemo } from 'react'
import { useToastStore } from '@/shared/stores/toastStore'

export function useToast() {
  const add = useToastStore((s) => s.addToast)
  // Memoize so the returned object keeps a stable identity across renders.
  // Without this, every render produces a new object, which breaks any
  // useCallback/useEffect that lists `toast` in its dependency array — e.g.
  // TranslationJobsPanel's refresh() would be recreated each render and its
  // "initial load" effect would re-fire in an infinite loop, flooding
  // GET /api/translations. `add` is a stable zustand selector result.
  return useMemo(() => ({
    success: (msg, duration) => add('success', msg, duration),
    error:   (msg, duration) => add('error',   msg, duration),
    warning: (msg, duration) => add('warning', msg, duration),
    info:    (msg, duration) => add('info',    msg, duration),
  }), [add])
}
