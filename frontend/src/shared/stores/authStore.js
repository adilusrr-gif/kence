import { create } from 'zustand'
import { getStoredUser } from '@/lib/api'

function toAuthState(user) {
  if (!user?.token) {
    return {
      token: null,
      userId: null,
      username: '',
      role: 'user',
      status: 'anonymous',
      lastAuthAt: null,
    }
  }

  return {
    token: user.token,
    userId: user.userId ?? null,
    username: user.username ?? '',
    role: user.role ?? 'user',
    status: 'authenticated',
    lastAuthAt: Date.now(),
  }
}

export const useAuthStore = create((set) => ({
  ...toAuthState(getStoredUser()),

  hydrateAuth: (user = getStoredUser()) => set(toAuthState(user)),

  setAuth: (payload) => set({
    ...toAuthState(payload),
    status: 'authenticated',
    lastAuthAt: Date.now(),
  }),

  clearAuth: () => set(toAuthState(null)),

  setStatus: (status) => set({ status }),
}))

export const selectIsAuthenticated = (state) => state.status === 'authenticated' && !!state.token
export const selectCurrentUser = (state) => (
  state.token
    ? {
        token: state.token,
        userId: state.userId,
        username: state.username,
        role: state.role,
      }
    : null
)
export const selectCurrentRole = (state) => state.role

export function syncAuthShadow(user) {
  useAuthStore.getState().hydrateAuth(user)
}
