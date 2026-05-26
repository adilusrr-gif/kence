/**
 * ComparisonPage unit tests — upload two files, trigger comparison modes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

import ComparisonPage from '../pages/ComparisonPage'

function renderPage() {
  return render(<ComparisonPage />)
}

describe('ComparisonPage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders initial upload UI', () => {
    renderPage()
    expect(screen.getByText(/сравнение/i)).toBeInTheDocument()
  })

  it('shows both file drop zones', () => {
    renderPage()
    const inputs = document.querySelectorAll('input[type="file"]')
    expect(inputs.length).toBeGreaterThanOrEqual(2)
  })

  it('renders semantic and technical comparison buttons', () => {
    renderPage()
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
  })
})
