/**
 * Tests for AdminExamListPage (P4).
 *
 * 覆蓋場景：
 * (a) status filter "Draft" → only Draft rows; "全部" → all rows
 * (b) 考生 column renders resolved name (full_name/username from usersMap), NOT raw candidate_id UUID;
 *     分數 column: null → '—', numeric → displayed
 * (c) delete confirm → DELETE /api/v1/exams/{id} called (204), row removed from state
 * (d) delete 400 (Ongoing exam) → inline error, row stays
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

// --- mock @/lib/api ---
vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    delete: vi.fn(),
  },
}))

// --- mock shadcn Dialog to render inline (avoid Radix portal issues in jsdom) ---
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
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
    return (
      <button onClick={onClick} disabled={disabled}>
        {children}
      </button>
    )
  },
}))

// --- mock ExamStatusBadge ---
vi.mock('@/components/ExamStatusBadge', () => ({
  default: ({ status }) => (
    <span data-testid={`status-badge-${status}`}>{status}</span>
  ),
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
import AdminExamListPage from './AdminExamListPage'

// Sparse list returned by GET /api/v1/exams/
const MOCK_SPARSE_EXAMS = [
  { id: 'exam-uuid-1', title: '草稿考試', status: 'Draft', score: null },
  { id: 'exam-uuid-2', title: '進行中考試', status: 'Ongoing', score: 88 },
  { id: 'exam-uuid-3', title: '已結束考試', status: 'Finished', score: 75 },
]

// Full ExamRead returned by GET /api/v1/exams/{id}
const MOCK_DETAIL_EXAMS = [
  {
    id: 'exam-uuid-1',
    title: '草稿考試',
    status: 'Draft',
    score: null,
    candidate_id: 'user-uuid-1',
    exam_problems: [],
  },
  {
    id: 'exam-uuid-2',
    title: '進行中考試',
    status: 'Ongoing',
    score: 88,
    candidate_id: 'user-uuid-2',
    exam_problems: [],
  },
  {
    id: 'exam-uuid-3',
    title: '已結束考試',
    status: 'Finished',
    score: 75,
    candidate_id: 'user-uuid-1',
    exam_problems: [],
  },
]

// Users returned by GET /api/v1/users/
const MOCK_USERS = [
  { id: 'user-uuid-1', username: 'alice', full_name: '愛麗絲' },
  { id: 'user-uuid-2', username: 'bob', full_name: null },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminExamListPage />
    </MemoryRouter>,
  )
}

describe('AdminExamListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // api.get is called in order: GET /exams/, GET /exams/{id}×3, GET /users/
    // We mock via callsFake to handle each URL
    api.get.mockImplementation((url) => {
      if (url === '/api/v1/exams/') {
        return Promise.resolve({ data: MOCK_SPARSE_EXAMS })
      }
      if (url === '/api/v1/exams/exam-uuid-1') {
        return Promise.resolve({ data: MOCK_DETAIL_EXAMS[0] })
      }
      if (url === '/api/v1/exams/exam-uuid-2') {
        return Promise.resolve({ data: MOCK_DETAIL_EXAMS[1] })
      }
      if (url === '/api/v1/exams/exam-uuid-3') {
        return Promise.resolve({ data: MOCK_DETAIL_EXAMS[2] })
      }
      if (url === '/api/v1/users/') {
        return Promise.resolve({ data: MOCK_USERS })
      }
      return Promise.reject(new Error(`unexpected url: ${url}`))
    })
  })

  // (a) status filter
  it('status filter "Draft" shows only Draft rows; "全部" restores all rows without re-fetch', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('草稿考試')).toBeInTheDocument()
    })

    const select = screen.getByRole('combobox', { name: /狀態篩選/ })
    fireEvent.change(select, { target: { value: 'Draft' } })

    expect(screen.getByText('草稿考試')).toBeInTheDocument()
    expect(screen.queryByText('進行中考試')).not.toBeInTheDocument()
    expect(screen.queryByText('已結束考試')).not.toBeInTheDocument()

    // Restore all rows
    fireEvent.change(select, { target: { value: '' } })

    expect(screen.getByText('草稿考試')).toBeInTheDocument()
    expect(screen.getByText('進行中考試')).toBeInTheDocument()
    expect(screen.getByText('已結束考試')).toBeInTheDocument()

    // Only 1 call to GET /exams/ — no re-fetch on filter change
    expect(api.get).toHaveBeenCalledWith('/api/v1/exams/')
  })

  // (b) 考生 column renders resolved name; 分數 null → '—', numeric → displayed
  it('renders resolved candidate name (not UUID) and formats score correctly', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('草稿考試')).toBeInTheDocument()
    })

    // user-uuid-1 has full_name '愛麗絲' — should appear as name, not UUID
    expect(screen.getAllByText('愛麗絲').length).toBeGreaterThanOrEqual(1)
    // user-uuid-2 has full_name null → falls back to username 'bob'
    expect(screen.getByText('bob')).toBeInTheDocument()
    // Raw UUIDs must NOT appear in the document
    expect(screen.queryByText('user-uuid-1')).not.toBeInTheDocument()
    expect(screen.queryByText('user-uuid-2')).not.toBeInTheDocument()

    // 分數: null → '—', numeric → displayed
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('88')).toBeInTheDocument()
    expect(screen.getByText('75')).toBeInTheDocument()
  })

  // (c) delete confirm → DELETE called, row removed
  it('confirming delete calls DELETE /api/v1/exams/{id} (204) and removes the row', async () => {
    api.delete.mockResolvedValue({ status: 204, data: '' })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('草稿考試')).toBeInTheDocument()
    })

    // Click delete button on the first exam row
    const deleteButtons = screen.getAllByRole('button', { name: '刪除' })
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '確認刪除' }))

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/api/v1/exams/exam-uuid-1')
    })

    await waitFor(() => {
      expect(screen.queryByText('草稿考試')).not.toBeInTheDocument()
    })
  })

  // (d) delete 400 (Ongoing exam) → inline error shown, row stays
  it('delete 400 error shows inline error and keeps the row in the DOM', async () => {
    api.delete.mockRejectedValue({
      response: { status: 400, data: { detail: '進行中的考試無法刪除' } },
    })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('進行中考試')).toBeInTheDocument()
    })

    // Click delete on the Ongoing exam (second row)
    const deleteButtons = screen.getAllByRole('button', { name: '刪除' })
    fireEvent.click(deleteButtons[1])

    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '確認刪除' }))

    await waitFor(() => {
      expect(screen.getByText('進行中的考試無法刪除')).toBeInTheDocument()
    })

    // Row stays
    expect(screen.getByText('進行中考試')).toBeInTheDocument()
  })
})
