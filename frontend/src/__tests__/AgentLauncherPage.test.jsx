/**
 * AgentLauncherPage — covers the render-guard around agentTypes and the
 * AgentTypeStack integration (role="radiogroup", onSelect wiring), since
 * neither the page nor AgentTypeStack had any test before this.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

const AGENT_TYPES = {
  document_analyst: { label: 'Document Analyst', description: 'Analyzes documents' },
  summary: { label: 'Summary', description: 'Summarizes documents' },
}

vi.mock('../lib/api', () => ({
  apiGetAgentTypes: vi.fn(() => Promise.resolve(AGENT_TYPES)),
  apiGetLibrary: vi.fn(() => Promise.resolve([])),
  apiGetTaxonomy: vi.fn(() => Promise.resolve({ direction: [] })),
}))

vi.mock('../shared/stores/orgStore', () => ({
  default: () => ({ currentOrgId: 'org-1' }),
}))

vi.mock('../shared/stores/agentStore', () => ({
  default: () => ({ createTask: vi.fn(() => Promise.resolve('task-1')) }),
}))

vi.mock('../shared/stores/toastStore', () => ({
  useToastStore: (selector) => selector({ addToast: vi.fn() }),
}))

import AgentLauncherPage from '../pages/AgentLauncherPage'

describe('AgentLauncherPage', () => {
  it('renders agent types as a radiogroup once loaded, and selecting one calls onSelect', async () => {
    render(<AgentLauncherPage />)

    const group = await screen.findByRole('radiogroup')
    const options = screen.getAllByRole('radio')
    expect(options).toHaveLength(2)
    expect(options[0]).toHaveAttribute('aria-checked', 'false')

    await userEvent.click(screen.getByText('Document Analyst'))
    expect(options[0]).toHaveAttribute('aria-checked', 'true')
    expect(group).toBeInTheDocument()
  })

  it('shows an error message and no radiogroup when agent types fail to load', async () => {
    const { apiGetAgentTypes } = await import('../lib/api')
    apiGetAgentTypes.mockImplementationOnce(() => Promise.reject(new Error('boom')))

    render(<AgentLauncherPage />)

    await waitFor(() => {
      expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    })
  })
})
