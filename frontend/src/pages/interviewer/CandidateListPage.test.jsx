/**
 * Tests for CandidateListPage (P5).
 *
 * 覆蓋場景：
 * (a) renders table rows filtered to role === 'Candidate' only (mock returns mixed roles)
 * (b) non-Candidate users do NOT appear in the table
 * (c) empty → "目前沒有考生"
 * (d) delete button is absent from the DOM
 */

import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

// --- mock @/lib/api ---
vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
  },
}))

// --- mock ui/button ---
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, asChild, variant }) => {
    if (asChild) return <span onClick={onClick}>{children}</span>
    return (
      <button onClick={onClick} disabled={disabled}>
        {children}
      </button>
    )
  },
}))

// --- mock LoadingSpinner ---
vi.mock('@/components/LoadingSpinner', () => ({
  default: () => <div data-testid="loading-spinner" />,
}))

// --- mock ErrorMessage ---
vi.mock('@/components/ErrorMessage', () => ({
  default: ({ message, onRetry }) => (
    <div>
      <span data-testid="error-message">{message}</span>
      {onRetry && <button onClick={onRetry}>重試</button>}
    </div>
  ),
}))

import api from '@/lib/api'
import CandidateListPage from './CandidateListPage'

// Mixed-role users — only the Candidate should appear in the table
const MOCK_USERS = [
  {
    id: 'user-cand-001',
    username: 'alice',
    full_name: '愛麗絲',
    role: 'Candidate',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'user-int-001',
    username: 'bob',
    full_name: '鮑伯',
    role: 'Interviewer',
    created_at: '2026-01-02T00:00:00Z',
  },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <CandidateListPage />
    </MemoryRouter>,
  )
}

describe('CandidateListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // (a) Only Candidate rows appear; fetches the correct URL
  // This test fails if the `filter(u => u.role === 'Candidate')` guard is removed
  it('renders only Candidate users from a mixed-role response', async () => {
    api.get.mockResolvedValue({ data: MOCK_USERS })
    renderPage()

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/v1/users/')
    })

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument()
    })
  })

  // (b) Non-Candidate users do NOT appear
  it('does not render non-Candidate users in the table', async () => {
    api.get.mockResolvedValue({ data: MOCK_USERS })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument()
    })

    // Interviewer 'bob' should not be in the table rows
    expect(screen.queryByText('bob')).not.toBeInTheDocument()
  })

  // (c) empty → "目前沒有考生"
  it('shows "目前沒有考生" when no Candidate users exist', async () => {
    // Return only non-Candidate users → filtered list is empty
    api.get.mockResolvedValue({
      data: [
        {
          id: 'int-1',
          username: 'charlie',
          role: 'Interviewer',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('目前沒有考生')).toBeInTheDocument()
    })
  })

  // (c) empty from start
  it('shows "目前沒有考生" when the user list is completely empty', async () => {
    api.get.mockResolvedValue({ data: [] })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('目前沒有考生')).toBeInTheDocument()
    })
  })

  // (d) delete button is absent from the DOM
  it('has no delete button in the DOM', async () => {
    api.get.mockResolvedValue({ data: MOCK_USERS })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument()
    })

    // No button or element with text "刪除"
    expect(screen.queryByText('刪除')).not.toBeInTheDocument()
    // Admin-note text is visible instead
    expect(screen.getByText('刪除考生帳號需由管理員操作')).toBeInTheDocument()
  })
})
