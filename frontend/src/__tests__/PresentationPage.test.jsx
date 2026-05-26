/**
 * PresentationPage unit tests — plan creation and build flow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

import PresentationPage from '../pages/PresentationPage'

function renderPage(sessionId = 'test-sid-123') {
  return render(<PresentationPage sessionId={sessionId} />)
}

describe('PresentationPage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders without crashing', () => {
    renderPage()
    expect(document.body).toBeTruthy()
  })

  it('shows generate plan button', () => {
    renderPage()
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('shows no-session message when sessionId is null', () => {
    renderPage(null)
    expect(screen.getByText(/загрузите документ/i)).toBeInTheDocument()
  })

  it('fetches plan on button click', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: 'Test Plan',
        slides: [
          { id: 's1', title: 'Intro', type: 'title', content: 'Intro content' },
        ],
      }),
    })

    renderPage('test-sid-123')
    const generateBtn = screen.getByRole('button', { name: /генерировать/i })
    await userEvent.click(generateBtn)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/presentations/plan'),
        expect.any(Object),
      )
    })
  })
})
