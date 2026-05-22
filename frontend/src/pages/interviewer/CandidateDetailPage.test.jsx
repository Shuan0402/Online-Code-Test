/**
 * Tests for CandidateDetailPage.
 *
 * 覆蓋場景：
 * (a) 渲染考生資料 + 考試列表，且考試是用 ?candidate_id= 篩選端點取得
 * (b) 不再 fan-out：只發 2 個請求（考生資料 + 篩選後考試），不逐場打 GET /exams/{id}
 * (c) 考試列表為空 → 顯示「尚無考試紀錄」
 * (d) 考試列表載入失敗 → 顯示「無法載入考試列表」
 */

import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// --- mock @/lib/api ---
vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

// --- mock ui/button ---
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, asChild }) => {
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
  default: ({ message }) => <span data-testid="error-message">{message}</span>,
}))

// --- mock ExamStatusBadge ---
vi.mock('@/components/ExamStatusBadge', () => ({
  default: ({ status }) => <span data-testid="exam-status-badge">{status}</span>,
}))

import api from '@/lib/api'
import CandidateDetailPage from './CandidateDetailPage'

const USER_ID = 'user-cand-001'

const MOCK_CANDIDATE = {
  id: USER_ID,
  username: 'alice',
  full_name: '愛麗絲',
  role: 'Candidate',
  created_at: '2026-01-01T00:00:00Z',
}

const MOCK_EXAMS = [
  { id: 'exam-1', title: '後端實作測驗', status: 'Published', duration_minutes: 90 },
  { id: 'exam-2', title: '演算法測驗', status: 'Finished', duration_minutes: 120 },
]

// 依 URL 回傳對應假資料；exams 預設用篩選端點
function mockApi({ exams = MOCK_EXAMS, examsReject = false } = {}) {
  api.get.mockImplementation((url) => {
    if (url === `/api/v1/users/${USER_ID}`) {
      return Promise.resolve({ data: MOCK_CANDIDATE })
    }
    if (url === `/api/v1/exams/?candidate_id=${USER_ID}`) {
      return examsReject
        ? Promise.reject(new Error('boom'))
        : Promise.resolve({ data: exams })
    }
    // 任何其他 URL（例如逐場 GET /exams/{id}）都視為非預期
    return Promise.reject(new Error(`unexpected url: ${url}`))
  })
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/interviewer/candidates/${USER_ID}`]}>
      <Routes>
        <Route path="/interviewer/candidates/:id" element={<CandidateDetailPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('CandidateDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // (a) 渲染考生資料 + 考試列表，並用 ?candidate_id= 篩選端點
  it('renders candidate profile and exams fetched via the candidate_id filter', async () => {
    mockApi()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('愛麗絲')).toBeInTheDocument()
      expect(screen.getByText('後端實作測驗')).toBeInTheDocument()
    })

    expect(screen.getByText('演算法測驗')).toBeInTheDocument()
    // 關鍵：考試是用後端篩選端點取得，而非撈全部再前端 filter
    expect(api.get).toHaveBeenCalledWith(`/api/v1/exams/?candidate_id=${USER_ID}`)
  })

  // (b) 不再 fan-out：剛好 2 個請求，且沒有逐場 GET /exams/{id}
  it('does not fan out — issues exactly two requests, no per-exam detail calls', async () => {
    mockApi()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('後端實作測驗')).toBeInTheDocument()
    })

    // 一個拿考生資料、一個拿篩選後的考試，共 2 個
    expect(api.get).toHaveBeenCalledTimes(2)
    // 不應出現「撈全部考試」或逐場詳情的請求
    expect(api.get).not.toHaveBeenCalledWith('/api/v1/exams/')
    const calledUrls = api.get.mock.calls.map((c) => c[0])
    expect(calledUrls.some((u) => /^\/api\/v1\/exams\/[^?]+$/.test(u))).toBe(false)
  })

  // (c) 考試列表為空 → 顯示「尚無考試紀錄」
  it('shows 尚無考試紀錄 when the candidate has no exams', async () => {
    mockApi({ exams: [] })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('尚無考試紀錄')).toBeInTheDocument()
    })
  })

  // (d) 考試列表載入失敗 → 顯示「無法載入考試列表」
  it('shows 無法載入考試列表 when the exams request fails', async () => {
    mockApi({ examsReject: true })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('無法載入考試列表')).toBeInTheDocument()
    })

    // 考生資料仍應正常顯示，不受考試請求失敗連坐
    expect(screen.getByText('愛麗絲')).toBeInTheDocument()
  })
})
