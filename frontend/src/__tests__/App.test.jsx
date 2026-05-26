/**
 * App-level routing tests.
 * Unauthenticated state redirects to /login.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

// ── Mock heavy dependencies ────────────────────────────────────────────────
vi.mock('../lib/api', () => ({
  getStoredUser: vi.fn(() => null),
  clearAuth: vi.fn(),
  apiCreateSession: vi.fn(),
  apiUploadDocument: vi.fn(),
}))

vi.mock('@/shared/stores/sessionTabsStore', () => ({
  useSessionTabsStore: vi.fn(() => vi.fn()),
  ROUTE_TAB_MAP: {},
}))

vi.mock('@/shared/stores/shellStore', () => ({
  useShellStore: vi.fn(() => 'dark'),
}))

vi.mock('@/shared/stores', () => ({
  syncAuthShadow: vi.fn(),
  syncShellShadow: vi.fn(),
  syncWorkspaceShadow: vi.fn(),
}))

vi.mock('@/app/shell/ShellHydrator', () => ({
  default: ({ children }) => <>{children}</>,
}))

vi.mock('@/shared/ui/toast', () => ({
  ToastContainer: () => null,
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))

vi.mock('../pages/LoginPage', () => ({
  default: ({ onLogin }) => <div data-testid="login-page">Login Page</div>,
}))

vi.mock('../pages/DashboardPage', () => ({
  default: () => <div data-testid="dashboard-page">Dashboard</div>,
}))

import App from '../App'

describe('App routing', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('redirects to login when unauthenticated', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )
    expect(screen.getByTestId('login-page')).toBeInTheDocument()
  })

  it('renders login page at /login when unauthenticated', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>
    )
    expect(screen.getByTestId('login-page')).toBeInTheDocument()
  })
})
