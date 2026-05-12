import { create } from 'zustand'

const DEFAULT_APP_NAME = 'KENCE.ai'
const DEFAULT_APP_EMOJI = 'K'

function toShellState(partial = {}) {
  return {
    theme: partial.theme ?? (localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'),
    density: partial.density ?? 'comfortable',
    appName: partial.appName ?? localStorage.getItem('appName') ?? DEFAULT_APP_NAME,
    appEmoji: partial.appEmoji ?? localStorage.getItem('appEmoji') ?? DEFAULT_APP_EMOJI,
    leftRail: {
      collapsed: partial.leftRail?.collapsed ?? false,
    },
    rightPanelShell: {
      open: partial.rightPanelShell?.open ?? false,
    },
    bottomRailShell: {
      expanded: partial.bottomRailShell?.expanded ?? false,
    },
    breakpoint: partial.breakpoint ?? 'desktop',
  }
}

export const useShellStore = create((set) => ({
  ...toShellState(),

  hydrateShell: (partial) => set((state) => toShellState({ ...state, ...partial })),

  toggleTheme: () => set((state) => ({
    theme: state.theme === 'dark' ? 'light' : 'dark',
  })),

  setTheme: (theme) => set({ theme }),
  setDensity: (density) => set({ density }),
  setAppName: (appName) => set({ appName: appName?.trim() || DEFAULT_APP_NAME }),
  setAppEmoji: (appEmoji) => set({ appEmoji: appEmoji?.trim() || DEFAULT_APP_EMOJI }),
  setLeftRailCollapsed: (collapsed) => set((state) => ({
    leftRail: { ...state.leftRail, collapsed },
  })),
  setRightPanelOpen: (open) => set((state) => ({
    rightPanelShell: { ...state.rightPanelShell, open },
  })),
  setBottomRailExpanded: (expanded) => set((state) => ({
    bottomRailShell: { ...state.bottomRailShell, expanded },
  })),
  setBreakpoint: (breakpoint) => set({ breakpoint }),
}))

export const selectTheme = (state) => state.theme
export const selectRailState = (state) => state.leftRail
export const selectShellDensity = (state) => state.density

export function syncShellShadow(partial) {
  useShellStore.getState().hydrateShell(partial)
}
