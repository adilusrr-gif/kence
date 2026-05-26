/**
 * UploadPage unit tests — file validation and upload flow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// ── Mocks ─────────────────────────────────────────────────────────────────
const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('../lib/api', () => ({
  apiCreateSession: vi.fn(() => Promise.resolve({ session_id: 'test-session-123' })),
  apiUploadDocument: vi.fn(() => Promise.resolve({
    status: 'processed',
    filename: 'test.txt',
    preview: 'Document preview text',
    char_count: 100,
    session_id: 'test-session-123',
  })),
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

vi.mock('@/shared/stores/eventStore', () => ({
  useEventStore: () => vi.fn(),
}))

// Mock UI primitives
vi.mock('@/shared/ui/badge', () => ({ Badge: ({ children }) => <span>{children}</span> }))
vi.mock('@/shared/ui/button', () => ({ Button: ({ children, onClick, disabled }) => <button onClick={onClick} disabled={disabled}>{children}</button> }))
vi.mock('@/shared/ui/card', () => ({ Card: ({ children }) => <div>{children}</div> }))
vi.mock('@/shared/ui/inline', () => ({ Inline: ({ children }) => <div>{children}</div> }))
vi.mock('@/shared/ui/stack', () => ({ Stack: ({ children }) => <div>{children}</div> }))
vi.mock('@/shared/ui/status-pill', () => ({ StatusPill: ({ children }) => <span>{children}</span> }))

import UploadPage from '../pages/UploadPage'

const renderUploadPage = (props = {}) => render(
  <UploadPage
    sessionId={null}
    setSessionId={vi.fn()}
    setDocumentName={vi.fn()}
    {...props}
  />
)

describe('UploadPage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders drop zone', () => {
    renderUploadPage()
    expect(screen.getByText(/перетащите/i)).toBeInTheDocument()
  })

  it('shows error for unsupported file extension', async () => {
    renderUploadPage()
    const input = document.querySelector('input[type="file"]')
    const badFile = new File(['content'], 'malware.exe', { type: 'application/octet-stream' })
    // applyAccept: false — simulates drag-and-drop which bypasses the accept filter
    await userEvent.upload(input, badFile, { applyAccept: false })
    await waitFor(() => {
      expect(screen.getByText(/не поддерживается/i)).toBeInTheDocument()
    })
  })

  it('accepts .txt file and shows filename', async () => {
    renderUploadPage()
    const input = document.querySelector('input[type="file"]')
    const file = new File(['Hello world'], 'test.txt', { type: 'text/plain' })
    await userEvent.upload(input, file)
    await waitFor(() => {
      expect(screen.getByText(/test\.txt/i)).toBeInTheDocument()
    })
  })

  it('accepts .pdf file', async () => {
    renderUploadPage()
    const input = document.querySelector('input[type="file"]')
    const file = new File(['%PDF-1.4'], 'doc.pdf', { type: 'application/pdf' })
    await userEvent.upload(input, file)
    await waitFor(() => {
      expect(screen.getByText(/doc\.pdf/i)).toBeInTheDocument()
    })
  })
})
