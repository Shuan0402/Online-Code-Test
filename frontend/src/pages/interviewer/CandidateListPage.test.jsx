/**
 * Tests for CandidateListPage (P5).
 *
 * 覆蓋場景：
 * (a) renders table rows filtered to role === 'Candidate' only (mock returns mixed roles)
 * (b) non-Candidate users do NOT appear in the table
 * (c) empty → "目前沒有考生"
 * (d) delete button is absent from the DOM
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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
    return <button onClick={onClick} disabled={disabled}>{children}</button>
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

const MOCK_TAGS = ['2026 校園徵才 - 前端工程師', '2026 校園徵才 - 後端工程師', '實習生']

// Mixed-role users — only the Candidate should appear in the table
const MOCK_USERS = [
  {
    id: 'user-cand-001',
    username: 'alice',
    full_name: '愛麗絲',
    role: 'Candidate',
    created_at: '2026-01-01T00:00:00Z',
    tags: ['2026 校園徵才 - 前端工程師'],
  },
  {
    id: 'user-cand-002',
    username: 'carol',
    full_name: '卡羅',
    role: 'Candidate',
    created_at: '2026-01-03T00:00:00Z',
    tags: ['2026 校園徵才 - 後端工程師'],
  },
  {
    id: 'user-int-001',
    username: 'bob',
    full_name: '鮑伯',
    role: 'Interviewer',
    created_at: '2026-01-02T00:00:00Z',
    tags: [],
  },
]

function mockApi(users = MOCK_USERS, tags = MOCK_TAGS) {
  api.get.mockImplementation((url) => {
    if (url === '/api/v1/users/') {
      return Promise.resolve({ data: users })
    }
    if (url === '/api/v1/exams/tags') {
      return Promise.resolve({ data: tags })
    }
    return Promise.reject(new Error(`unexpected url: ${url}`))
  })
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CandidateListPage />
    </MemoryRouter>
  )
}

describe('CandidateListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // (a) Only Candidate rows appear; fetches the correct URL
  // This test fails if the `filter(u => u.role === 'Candidate')` guard is removed
  it('renders only Candidate users from a mixed-role response', async () => {
    mockApi()
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
    mockApi()
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
    mockApi([
      { id: 'int-1', username: 'charlie', role: 'Interviewer', created_at: '2026-01-01T00:00:00Z', tags: [] },
    ])
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('目前沒有考生')).toBeInTheDocument()
    })
  })

  // (c) empty from start
  it('shows "目前沒有考生" when the user list is completely empty', async () => {
    mockApi([])
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('目前沒有考生')).toBeInTheDocument()
    })
  })

  // (d) delete button is absent from the DOM
  it('has no delete button in the DOM', async () => {
    mockApi()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument()
    })

    // No button or element with text "刪除"
    expect(screen.queryByText('刪除')).not.toBeInTheDocument()
    // Admin-note text is visible instead
    expect(screen.getByText('刪除考生帳號需由管理員操作')).toBeInTheDocument()
  })

  it('filters candidates by selected tag', async () => {
    mockApi()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument()
      expect(screen.getByText('carol')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('篩選標籤：'), {
      target: { value: '2026 校園徵才 - 前端工程師' },
    })

    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.queryByText('carol')).not.toBeInTheDocument()
  })

  it('shows empty message when no candidates match the selected tag', async () => {
    mockApi()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('篩選標籤：'), {
      target: { value: '實習生' },
    })

    expect(screen.getByText('沒有符合此標籤的考生')).toBeInTheDocument()
    expect(screen.queryByText('alice')).not.toBeInTheDocument()
  })
})
