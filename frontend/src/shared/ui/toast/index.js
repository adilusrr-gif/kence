export { ToastContainer } from './Toast'
export { useToastStore } from '@/shared/stores/toastStore'

import { useToastStore } from '@/shared/stores/toastStore'

export function useToast() {
  const add = useToastStore((s) => s.addToast)
  return {
    success: (msg, duration) => add('success', msg, duration),
    error:   (msg, duration) => add('error',   msg, duration),
    warning: (msg, duration) => add('warning', msg, duration),
    info:    (msg, duration) => add('info',    msg, duration),
  }
}
