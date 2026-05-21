/**
 * Tests for AdminProblemListPage (P5).
 *
 * 覆蓋場景：
 * (a) difficulty filter "Easy" → only Easy rows; "全部" → all rows
 *     filter is case-sensitive match against DifficultyLevel enum (Easy|Medium|Hard)
 * (b) delete confirm → DELETE /api/v1/problems/{id} called (204), row removed from state
 *     mock api.delete resolves with { status: 204, data: '' }
 * (c) delete error → inline error shown, row stays
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
import AdminProblemListPage from './AdminProblemListPage'

const MOCK_PROBLEMS = [
  { id: 1, title: '簡單題目 A', difficulty: 'Easy' },
  { id: 2, title: '中等題目 B', difficulty: 'Medium' },
  { id: 3, title: '困難題目 C', difficulty: 'Hard' },
  { id: 4, title: '簡單題目 D', difficulty: 'Easy' },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminProblemListPage />
    </MemoryRouter>,
  )
}

describe('AdminProblemListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: MOCK_PROBLEMS })
  })

  // (a) difficulty filter
  it('filter "Easy" shows only Easy rows; "全部" restores all rows without re-fetch', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('簡單題目 A')).toBeInTheDocument()
    })

    const select = screen.getByRole('combobox', { name: /難度篩選/ })
    fireEvent.change(select, { target: { value: 'Easy' } })

    // Easy rows visible
    expect(screen.getByText('簡單題目 A')).toBeInTheDocument()
    expect(screen.getByText('簡單題目 D')).toBeInTheDocument()
    // Non-Easy rows hidden
    expect(screen.queryByText('中等題目 B')).not.toBeInTheDocument()
    expect(screen.queryByText('困難題目 C')).not.toBeInTheDocument()

    // Restore all rows
    fireEvent.change(select, { target: { value: '' } })

    expect(screen.getByText('簡單題目 A')).toBeInTheDocument()
    expect(screen.getByText('中等題目 B')).toBeInTheDocument()
    expect(screen.getByText('困難題目 C')).toBeInTheDocument()
    expect(screen.getByText('簡單題目 D')).toBeInTheDocument()

    // Only 1 GET call — no re-fetch on filter change
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith('/api/v1/problems/')
  })

  // (b) delete confirm → DELETE called (204), row removed
  it('confirming delete calls DELETE /api/v1/problems/{id} (204) and removes the row', async () => {
    api.delete.mockResolvedValue({ status: 204, data: '' })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('簡單題目 A')).toBeInTheDocument()
    })

    // Click delete button on the first row
    const deleteButtons = screen.getAllByRole('button', { name: '刪除' })
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '確認刪除' }))

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/api/v1/problems/1')
    })

    await waitFor(() => {
      expect(screen.queryByText('簡單題目 A')).not.toBeInTheDocument()
    })

    // Other rows still visible
    expect(screen.getByText('中等題目 B')).toBeInTheDocument()
  })

  // (c) delete error → inline error shown, row stays
  it('delete error shows inline error and keeps the row in the DOM', async () => {
    api.delete.mockRejectedValue({
      response: { status: 500, data: { detail: '刪除失敗，伺服器錯誤' } },
    })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('中等題目 B')).toBeInTheDocument()
    })

    // Click delete on the second row
    const deleteButtons = screen.getAllByRole('button', { name: '刪除' })
    fireEvent.click(deleteButtons[1])

    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '確認刪除' }))

    await waitFor(() => {
      expect(screen.getByText('刪除失敗，伺服器錯誤')).toBeInTheDocument()
    })

    // Row stays
    expect(screen.getByText('中等題目 B')).toBeInTheDocument()
  })
})
