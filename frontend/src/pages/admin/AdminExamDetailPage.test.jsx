/**
 * Tests for AdminExamDetailPage (P5).
 *
 * 覆蓋場景：
 * (a) page loads and displays exam details using usersMap resolution and problem table
 * (b) delete confirm button calls DELETE and navigates away
 * (c) page load error displays ErrorMessage
 * (d) delete failure shows inline error and keeps page content
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// --- mock @/lib/api ---
vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    delete: vi.fn(),
  },
}))

// --- mock ui/dialog ---
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <div>{children}</div>,
  DialogDescription: ({ children }) => <div>{children}</div>,
  DialogFooter: ({ children }) => <div>{children}</div>,
}))

// --- mock ui/button ---
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, asChild }) => {
    if (asChild) return <span onClick={onClick}>{children}</span>
    return <button onClick={onClick} disabled={disabled}>{children}</button>
  },
}))

// --- mock ExamStatusBadge ---
vi.mock('@/components/ExamStatusBadge', () => ({
  default: ({ status }) => <span data-testid="status-badge">{status}</span>,
}))

// --- mock LoadingSpinner ---
vi.mock('@/components/LoadingSpinner', () => ({
  default: () => <div data-testid="loading-spinner" />,
}))

// --- mock ErrorMessage ---
vi.mock('@/components/ErrorMessage', () => ({
  default: ({ message }) => <div data-testid="error-message">{message}</div>,
}))

import api from '@/lib/api'
import AdminExamDetailPage from './AdminExamDetailPage'

const EXAM_ID = 'exam-uuid-1'

const MOCK_EXAM = {
  id: EXAM_ID,
  title: '期末大考',
  status: 'Finished',
  candidate_id: 'user-uuid-123',
  score: 90,
  duration_minutes: 120,
  start_time: '2026-06-10T09:00:00',
  end_time: '2026-06-10T11:00:00',
  easy_count: 1,
  medium_count: 2,
  hard_count: 0,
  exam_problems: [
    { sequence: 1, title: 'A+B', difficulty: 'Easy', points: 50 },
    { sequence: 2, title: 'Binary Search', difficulty: 'Medium', points: 50 },
  ],
}

const MOCK_USERS = [
  { id: 'user-uuid-123', username: 'candidate001', full_name: '小明' },
]

function renderPage(id = EXAM_ID) {
  return render(
    <MemoryRouter initialEntries={[`/admin/exams/${id}`]}>
      <Routes>
        <Route path="/admin/exams/:id" element={<AdminExamDetailPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('AdminExamDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads and displays exam detail with resolved candidate name and problem table', async () => {
    api.get.mockImplementation((url) => {
      if (url === `/api/v1/exams/${EXAM_ID}`) {
        return Promise.resolve({ data: MOCK_EXAM })
      }
      if (url === '/api/v1/users/') {
        return Promise.resolve({ data: MOCK_USERS })
      }
      return Promise.reject(new Error(`unexpected url: ${url}`))
    })

    renderPage()

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('考試詳情')).toBeInTheDocument()
    })

    expect(screen.getByText('期末大考')).toBeInTheDocument()
    expect(screen.getByTestId('status-badge')).toHaveTextContent('Finished')
    expect(screen.getByText('小明')).toBeInTheDocument()
    expect(screen.getByText('90')).toBeInTheDocument()
    expect(screen.getByText('120')).toBeInTheDocument()
    expect(screen.getAllByRole('row').length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText('A+B')).toBeInTheDocument()
    expect(screen.getByText('Binary Search')).toBeInTheDocument()

    // start_time/end_time should not render placeholder dash when provided
    expect(screen.queryAllByText('—').length).toBeLessThan(3)

    expect(api.get).toHaveBeenCalledWith(`/api/v1/exams/${EXAM_ID}`)
    expect(api.get).toHaveBeenCalledWith('/api/v1/users/')
  })

  it('shows raw candidate_id when usersMap has no matching user', async () => {
    const examWithUnknownCandidate = {
      ...MOCK_EXAM,
      candidate_id: 'unknown-uuid',
      exam_problems: [],
    }

    api.get.mockImplementation((url) => {
      if (url === `/api/v1/exams/${EXAM_ID}`) {
        return Promise.resolve({ data: examWithUnknownCandidate })
      }
      if (url === '/api/v1/users/') {
        return Promise.resolve({ data: [] })
      }
      return Promise.reject(new Error(`unexpected url: ${url}`))
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('考試詳情')).toBeInTheDocument()
    })

    expect(screen.getByText('unknown-uuid')).toBeInTheDocument()
    expect(screen.getByText('此考試沒有題目')).toBeInTheDocument()
  })

  it('opens delete dialog and calls DELETE /api/v1/exams/{id} on confirm', async () => {
    api.get.mockImplementation((url) => {
      if (url === `/api/v1/exams/${EXAM_ID}`) {
        return Promise.resolve({ data: MOCK_EXAM })
      }
      if (url === '/api/v1/users/') {
        return Promise.resolve({ data: MOCK_USERS })
      }
      return Promise.reject(new Error(`unexpected url: ${url}`))
    })
    api.delete.mockResolvedValue({ status: 204 })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('期末大考')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '刪除考試' }))

    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '確認刪除' }))

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith(`/api/v1/exams/${EXAM_ID}`)
    })
  })

  it('shows a load error message when exam fetch fails', async () => {
    api.get.mockRejectedValue({ response: { data: { detail: '載入考試資料失敗' } } })

    renderPage()

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeInTheDocument()
    })

    expect(screen.getByTestId('error-message')).toHaveTextContent('載入考試資料失敗')
  })

  it('shows delete error inline when DELETE fails and keeps the page content', async () => {
    api.get.mockImplementation((url) => {
      if (url === `/api/v1/exams/${EXAM_ID}`) {
        return Promise.resolve({ data: MOCK_EXAM })
      }
      if (url === '/api/v1/users/') {
        return Promise.resolve({ data: MOCK_USERS })
      }
      return Promise.reject(new Error(`unexpected url: ${url}`))
    })
    api.delete.mockRejectedValue({ response: { data: { detail: '刪除失敗，請稍後再試' } } })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('期末大考')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '刪除考試' }))
    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '確認刪除' }))

    await waitFor(() => {
      expect(screen.getByText('刪除失敗，請稍後再試')).toBeInTheDocument()
    })
    expect(screen.getByText('期末大考')).toBeInTheDocument()
  })
})