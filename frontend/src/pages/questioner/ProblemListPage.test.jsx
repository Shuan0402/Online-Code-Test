/**
 * Tests for ProblemListPage.
 *
 * 覆蓋場景：
 * (a) difficulty filter — 選擇「困難」後只剩 Hard 的那筆
 * (b) delete — 確認刪除後呼叫 DELETE API，並移除列
 * (c) rejudge — mock POST /rejudge 後顯示「已觸發 N 筆重測」
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

// --- mock @/lib/api ---
vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    delete: vi.fn(),
    post: vi.fn(),
  },
}))

// --- mock shadcn Dialog to render inline (avoid Radix portal issues in jsdom) ---
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children, onOpenChange }) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <div>{children}</div>,
  DialogDescription: ({ children }) => <div>{children}</div>,
  DialogFooter: ({ children }) => <div>{children}</div>,
}))

// --- mock ui/button to plain <button> ---
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, size, asChild }) => {
    if (asChild) return <span onClick={onClick}>{children}</span>
    return (
      <button onClick={onClick} disabled={disabled} data-variant={variant}>
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
import ProblemListPage from './ProblemListPage'

const MOCK_PROBLEMS = [
  { id: 1, title: '簡單題', difficulty: 'Easy' },
  { id: 2, title: '困難題', difficulty: 'Hard' },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <ProblemListPage />
    </MemoryRouter>
  )
}

describe('ProblemListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: MOCK_PROBLEMS })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // (a) difficulty filter
  it('selecting 困難 filter shows only the Hard row', async () => {
    renderPage()

    // 等待題目列表載入
    await waitFor(() => {
      expect(screen.getByText('簡單題')).toBeInTheDocument()
      expect(screen.getByText('困難題')).toBeInTheDocument()
    })

    // 選擇「困難」
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'Hard' } })

    // 只剩「困難題」，簡單題消失
    expect(screen.getByText('困難題')).toBeInTheDocument()
    expect(screen.queryByText('簡單題')).not.toBeInTheDocument()
  })

  it('shows 沒有符合條件的題目 when filter active but nothing matches', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('簡單題')).toBeInTheDocument()
    })

    // 選擇「中等」— 兩筆都不符合
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'Medium' } })

    expect(screen.getByText('沒有符合條件的題目')).toBeInTheDocument()
  })

  it('shows 目前沒有題目 when list is genuinely empty (no filter)', async () => {
    api.get.mockResolvedValue({ data: [] })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('目前沒有題目')).toBeInTheDocument()
    })
  })

  // (b) delete
  it('confirming delete calls DELETE API and removes the row', async () => {
    api.delete.mockResolvedValue({})
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('簡單題')).toBeInTheDocument()
    })

    // 點擊第一個「刪除」按鈕（對應 id=1 的問題）
    const deleteButtons = screen.getAllByText('刪除')
    fireEvent.click(deleteButtons[0])

    // Dialog 應該出現
    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument()
    })

    // 點「確認刪除」按鈕（避免和 DialogTitle 的文字衝突，用 role+name）
    fireEvent.click(screen.getByRole('button', { name: '確認刪除' }))

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/api/v1/problems/1')
    })

    // 那筆從 DOM 消失
    await waitFor(() => {
      expect(screen.queryByText('簡單題')).not.toBeInTheDocument()
    })
  })

  it('shows inline error inside dialog on delete failure', async () => {
    api.delete.mockRejectedValue({
      response: { data: { detail: '刪除失敗，請稍後再試' } },
    })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('簡單題')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByText('刪除')
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '確認刪除' }))

    await waitFor(() => {
      expect(screen.getByText('刪除失敗，請稍後再試')).toBeInTheDocument()
    })

    // 列仍在 DOM 中
    expect(screen.getByText('簡單題')).toBeInTheDocument()
  })

  // (c) rejudge
  it('rejudge shows 已觸發 3 筆重測 from 202 response', async () => {
    api.post.mockResolvedValue({
      data: { message: 'ok', problem_id: 1, submissions_triggered: 3 },
    })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('簡單題')).toBeInTheDocument()
    })

    // 點第一個「重測」按鈕（problem id=1）
    const rejudgeButtons = screen.getAllByText('重測')
    fireEvent.click(rejudgeButtons[0])

    await waitFor(() => {
      expect(screen.getByText('已觸發 3 筆重測')).toBeInTheDocument()
    })

    expect(api.post).toHaveBeenCalledWith('/api/v1/problems/1/rejudge')
  })

  it('rejudge shows 已觸發 0 筆重測 when submissions_triggered is 0', async () => {
    api.post.mockResolvedValue({
      data: { message: 'ok', problem_id: 2, submissions_triggered: 0 },
    })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('困難題')).toBeInTheDocument()
    })

    const rejudgeButtons = screen.getAllByText('重測')
    fireEvent.click(rejudgeButtons[1]) // second row = id=2

    await waitFor(() => {
      expect(screen.getByText('已觸發 0 筆重測')).toBeInTheDocument()
    })
  })
})
