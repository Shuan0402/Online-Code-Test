/**
 * Tests for ExamListPage (P4 enrichments + P1 base + Bug 4 server-side filters).
 *
 * 覆蓋場景：
 * (a) status filter: selecting "Draft" → only Draft rows visible; "全部" restores all
 * (b) score column: null → "—", 150 → "150 分"
 * (c) delete confirm → DELETE called with exact UUID; row removed on success
 * (d) delete 400 → inline error, row stays
 * (e) Bug 4: created_start/end date inputs trigger refetch with ISO date params
 * (f) Bug 4: score_gte/lte 答對率 % inputs send numeric params
 * (g) Bug 4: mineOnly toggle sends mine=true via params
 * (h) Bug 4: 重設篩選 clears all filter state and re-fires API with empty params
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

// --- mock shadcn Dialog to render inline (avoid Radix portal issues in jsdom) ---
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <div>{children}</div>,
  DialogDescription: ({ children }) => <div>{children}</div>,
  DialogFooter: ({ children }) => <div>{children}</div>,
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

// --- mock ExamStatusBadge ---
vi.mock('@/components/ExamStatusBadge', () => ({
  default: ({ status }) => <span data-testid={`badge-${status}`}>{status}</span>,
}))

import api from '@/lib/api'
import ExamListPage from './ExamListPage'

const UUID_1 = 'aaaaaaaa-1111-1111-1111-000000000001'
const UUID_2 = 'aaaaaaaa-2222-2222-2222-000000000002'

const MOCK_EXAMS = [
  { id: UUID_1, title: '草稿考試', status: 'Draft', duration_minutes: 60, score: null, created_at: '2026-01-01T00:00:00Z' },
  { id: UUID_2, title: '進行中考試', status: 'Ongoing', duration_minutes: 90, score: 150, created_at: '2026-01-02T00:00:00Z' },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <ExamListPage />
    </MemoryRouter>
  )
}

describe('ExamListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: MOCK_EXAMS })
  })

  // (a) status filter — selecting "Draft" → only Draft rows visible
  // This test fails if the statusFilter guard (`statusFilter ? exams.filter(...) : exams`) is removed
  it('selecting Draft filter shows only Draft rows', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('草稿考試')).toBeInTheDocument()
      expect(screen.getByText('進行中考試')).toBeInTheDocument()
    })

    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'Draft' } })

    expect(screen.getByText('草稿考試')).toBeInTheDocument()
    expect(screen.queryByText('進行中考試')).not.toBeInTheDocument()
  })

  it('selecting 全部 restores all rows without making an extra API call', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('草稿考試')).toBeInTheDocument()
    })

    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'Draft' } })
    expect(screen.queryByText('進行中考試')).not.toBeInTheDocument()

    fireEvent.change(select, { target: { value: '' } })
    expect(screen.getByText('進行中考試')).toBeInTheDocument()

    // Only one GET call was made (the initial load)
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith('/api/v1/exams/', { params: {} })
  })

  // (b) score column: null → "—", 150 → "150 分"
  it('shows "—" for null score and "150 分" for numeric score', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('草稿考試')).toBeInTheDocument()
    })

    // null score → "—"
    expect(screen.getByText('—')).toBeInTheDocument()
    // numeric score → "150 分"
    expect(screen.getByText('150 分')).toBeInTheDocument()
  })

  // (c) delete confirm → DELETE called with exact UUID; row removed
  it('confirming delete calls DELETE /api/v1/exams/{uuid} with exact UUID and removes the row', async () => {
    api.delete.mockResolvedValue({})
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('草稿考試')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByText('刪除')
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '確認刪除' }))

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith(`/api/v1/exams/${UUID_1}`)
    })

    await waitFor(() => {
      expect(screen.queryByText('草稿考試')).not.toBeInTheDocument()
    })
  })

  // (e) Bug 4: created_start/end date inputs fire refetch with date params
  it('typing into created_start/end inputs refetches with created_start/created_end params', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('草稿考試')).toBeInTheDocument()
    })

    // Initial load
    expect(api.get).toHaveBeenLastCalledWith('/api/v1/exams/', { params: {} })

    const startInput = document.getElementById('created-start')
    const endInput = document.getElementById('created-end')

    fireEvent.change(startInput, { target: { value: '2026-05-05' } })
    fireEvent.change(endInput, { target: { value: '2026-05-08' } })

    await waitFor(() => {
      expect(api.get).toHaveBeenLastCalledWith('/api/v1/exams/', {
        params: { created_start: '2026-05-05', created_end: '2026-05-08' },
      })
    })
  })

  // (f) Bug 4: score_gte/lte inputs send numeric params (not strings)
  it('typing into score_gte/lte inputs sends numeric params', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('草稿考試')).toBeInTheDocument()
    })

    const gteInput = document.getElementById('score-gte')
    const lteInput = document.getElementById('score-lte')

    fireEvent.change(gteInput, { target: { value: '60' } })
    fireEvent.change(lteInput, { target: { value: '90' } })

    await waitFor(() => {
      expect(api.get).toHaveBeenLastCalledWith('/api/v1/exams/', {
        params: { score_gte: 60, score_lte: 90 },
      })
    })

    // Verify they are JS numbers, not strings — protects against `params.score_gte = e.target.value` regression
    const lastCall = api.get.mock.calls[api.get.mock.calls.length - 1]
    expect(typeof lastCall[1].params.score_gte).toBe('number')
    expect(typeof lastCall[1].params.score_lte).toBe('number')
  })

  // (g) Bug 4: mineOnly toggle sends mine=true
  it('clicking 「只看我的」 toggle sends mine=true via params', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('草稿考試')).toBeInTheDocument()
    })

    const toggle = document.getElementById('mine-only-toggle')
    fireEvent.click(toggle)

    await waitFor(() => {
      expect(api.get).toHaveBeenLastCalledWith('/api/v1/exams/', {
        params: { mine: true },
      })
    })
  })

  // (h) Bug 4: 重設篩選 clears all filters
  it('clicking 重設篩選 clears every filter and refetches with empty params', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('草稿考試')).toBeInTheDocument()
    })

    // Set several filters
    fireEvent.change(document.getElementById('created-start'), { target: { value: '2026-05-05' } })
    fireEvent.change(document.getElementById('score-gte'), { target: { value: '50' } })
    fireEvent.click(document.getElementById('mine-only-toggle'))

    await waitFor(() => {
      expect(api.get).toHaveBeenLastCalledWith('/api/v1/exams/', {
        params: { created_start: '2026-05-05', score_gte: 50, mine: true },
      })
    })

    // Click reset
    fireEvent.click(document.getElementById('reset-filters'))

    await waitFor(() => {
      expect(api.get).toHaveBeenLastCalledWith('/api/v1/exams/', { params: {} })
    })

    // UI state cleared
    expect(document.getElementById('created-start').value).toBe('')
    expect(document.getElementById('score-gte').value).toBe('')
  })

  // (d) delete 400 → inline error, row stays
  it('delete 400 shows inline error and keeps the row in the DOM', async () => {
    api.delete.mockRejectedValue({
      response: { data: { detail: '無法刪除已發布考試' } },
    })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('草稿考試')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByText('刪除')
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '確認刪除' }))

    await waitFor(() => {
      expect(screen.getByText('無法刪除已發布考試')).toBeInTheDocument()
    })

    // Row stays
    expect(screen.getByText('草稿考試')).toBeInTheDocument()
  })
})
