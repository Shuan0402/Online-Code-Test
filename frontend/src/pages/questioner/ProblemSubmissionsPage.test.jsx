/**
 * Tests for ProblemSubmissionsPage.
 *
 * 覆蓋場景：
 * (a) mocked GET /submissions/?problem_id=X 200 → 渲染提交列
 * (b) 點「查看詳情」→ GET /submissions/{id} → Dialog 顯示 judge_log
 * (c) 空列表 → 顯示「尚無提交紀錄」
 * (d) details 為空 → Dialog 顯示「無詳細測試資料」
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// --- mock @/lib/api ---
vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

// --- mock shadcn Dialog to render inline (avoid Radix portal issues in jsdom) ---
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <div>{children}</div>,
}))

// --- mock ui/button ---
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, size }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}))

// --- mock JudgeStatusBadge ---
vi.mock('@/components/JudgeStatusBadge', () => ({
  default: ({ status }) => <span data-testid="status-badge">{status}</span>,
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
import ProblemSubmissionsPage from './ProblemSubmissionsPage'

const MOCK_SUBMISSIONS = [
  {
    id: 101,
    user_id: 'alice',
    problem_id: 5,
    status: 'AC',
    score: 100,
    execution_time: 42,
    memory_usage: 16,
    judge_log: '通過全部測資',
    created_at: '2026-05-21T10:00:00Z',
    details: [],
  },
  {
    id: 102,
    user_id: 'bob',
    problem_id: 5,
    status: 'WA',
    score: 50,
    execution_time: null,
    memory_usage: null,
    judge_log: null,
    created_at: '2026-05-21T11:00:00Z',
    details: [],
  },
]

// 渲染時掛在 /questioner/problems/5/submissions，useParams 會取到 id=5
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/questioner/problems/5/submissions']}>
      <Routes>
        <Route
          path="/questioner/problems/:id/submissions"
          element={<ProblemSubmissionsPage />}
        />
      </Routes>
    </MemoryRouter>
  )
}

describe('ProblemSubmissionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // (a) renders submission rows from mocked GET 200
  it('renders submission rows from mocked GET list', async () => {
    api.get.mockResolvedValue({ data: MOCK_SUBMISSIONS })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument()
      expect(screen.getByText('bob')).toBeInTheDocument()
    })

    expect(api.get).toHaveBeenCalledWith('/api/v1/submissions/?problem_id=5')

    // status badges present
    const badges = screen.getAllByTestId('status-badge')
    expect(badges).toHaveLength(2)
    expect(badges[0].textContent).toBe('AC')
    expect(badges[1].textContent).toBe('WA')
  })

  // (b) clicking 查看詳情 fetches detail and opens dialog showing judge_log
  it('clicking 查看詳情 opens dialog with judge_log', async () => {
    // list fetch
    api.get.mockResolvedValueOnce({ data: MOCK_SUBMISSIONS })
    // detail fetch (id=101)
    api.get.mockResolvedValueOnce({
      data: {
        ...MOCK_SUBMISSIONS[0],
        judge_log: '評測日誌內容',
        details: [
          { id: 1, status: 'AC', execution_time: 10, memory_usage: 8, score: 10 },
        ],
      },
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument()
    })

    // Click the first 查看詳情 button
    const detailButtons = screen.getAllByText('查看詳情')
    fireEvent.click(detailButtons[0])

    // Dialog should open and show judge_log
    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument()
      expect(screen.getByText('評測日誌內容')).toBeInTheDocument()
    })

    expect(api.get).toHaveBeenCalledWith('/api/v1/submissions/101')
  })

  // (c) empty list shows 尚無提交紀錄
  it('shows 尚無提交紀錄 when GET returns empty list', async () => {
    api.get.mockResolvedValue({ data: [] })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('尚無提交紀錄')).toBeInTheDocument()
    })
  })

  // (d) details: [] in dialog shows 無詳細測試資料
  it('shows 無詳細測試資料 when details array is empty in dialog', async () => {
    api.get.mockResolvedValueOnce({ data: MOCK_SUBMISSIONS })
    api.get.mockResolvedValueOnce({
      data: {
        ...MOCK_SUBMISSIONS[0],
        judge_log: '日誌',
        details: [],
      },
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument()
    })

    const detailButtons = screen.getAllByText('查看詳情')
    fireEvent.click(detailButtons[0])

    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument()
      expect(screen.getByText('無詳細測試資料')).toBeInTheDocument()
    })
  })

  // edge: null judge_log renders 無 in dialog
  it('null judge_log shows 無 in dialog', async () => {
    api.get.mockResolvedValueOnce({ data: MOCK_SUBMISSIONS })
    api.get.mockResolvedValueOnce({
      data: {
        ...MOCK_SUBMISSIONS[1],
        judge_log: null,
        details: [],
      },
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('bob')).toBeInTheDocument()
    })

    const detailButtons = screen.getAllByText('查看詳情')
    fireEvent.click(detailButtons[1])

    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument()
      // judge_log is null → 顯示「無」
      expect(screen.getByText('無')).toBeInTheDocument()
    })
  })
})
