/**
 * Tests for ExamResultPage (P4).
 *
 * 覆蓋場景：
 * (a) renders total score "135 / 300 分"
 * (b) total_candidate_score === null → "— / 300 分", no crash
 * (c) results[] empty → "尚無結果"
 * (d) "Unsubmitted" status → JudgeStatusBadge renders "未提交"
 */

import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

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
  default: ({ message }) => <div data-testid="error-message">{message}</div>,
}))

// --- mock ExamStatusBadge ---
vi.mock('@/components/ExamStatusBadge', () => ({
  default: ({ status }) => <span data-testid="exam-status-badge">{status}</span>,
}))

// --- mock JudgeStatusBadge — maps Unsubmitted → 未提交 (same as real component) ---
vi.mock('@/components/JudgeStatusBadge', () => ({
  default: ({ status }) => {
    const LABELS = {
      Accepted: '通過',
      WrongAnswer: '答案錯誤',
      TimeLimitExceeded: '超時',
      Pending: '待評測',
      Unsubmitted: '未提交',
    }
    return <span data-testid="judge-status-badge">{LABELS[status] ?? status}</span>
  },
}))

import api from '@/lib/api'
import ExamResultPage from './ExamResultPage'

const EXAM_UUID = 'aaaaaaaa-0000-0000-0000-000000000001'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/interviewer/exams/${EXAM_UUID}/result`]}>
      <Routes>
        <Route path="/interviewer/exams/:id/result" element={<ExamResultPage />} />
      </Routes>
    </MemoryRouter>
  )
}

const MOCK_RESULT_BASE = {
  title: 'Spring 2026 面試',
  status: 'Finished',
  total_exam_points: 300,
  results: [
    {
      problem_id: 1,
      sequence: 1,
      title: '簡單題',
      max_points: 100,
      candidate_score: 100,
      submission_status: 'Accepted',
    },
    {
      problem_id: 2,
      sequence: 2,
      title: '困難題',
      max_points: 200,
      candidate_score: 35,
      submission_status: 'WrongAnswer',
    },
  ],
}

describe('ExamResultPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // (a) renders total score correctly
  it('renders total score "135 / 300 分" from the result payload', async () => {
    api.get.mockResolvedValue({
      data: { ...MOCK_RESULT_BASE, total_candidate_score: 135 },
    })
    renderPage()

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(`/api/v1/exams/${EXAM_UUID}/result`, { params: {} })
    })

    // score banner shows 135 and max 300 分
    await waitFor(() => {
      expect(screen.getByText('135')).toBeInTheDocument()
      expect(screen.getByText(/300 分/)).toBeInTheDocument()
    })
  })

  // (b) null score → "— / 300 分", no crash
  // This test fails if the `total_candidate_score != null` null-guard is removed
  it('renders "—" when total_candidate_score is null without crashing', async () => {
    api.get.mockResolvedValue({
      data: { ...MOCK_RESULT_BASE, total_candidate_score: null },
    })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('—')).toBeInTheDocument()
      expect(screen.getByText(/300 分/)).toBeInTheDocument()
    })
  })

  // (c) empty results[] → "尚無結果" empty state
  it('shows "尚無結果" when results array is empty', async () => {
    api.get.mockResolvedValue({
      data: { ...MOCK_RESULT_BASE, total_candidate_score: 0, results: [] },
    })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('尚無結果')).toBeInTheDocument()
    })
  })

  // (d) Unsubmitted → JudgeStatusBadge renders "未提交"
  it('renders "未提交" via JudgeStatusBadge for Unsubmitted status', async () => {
    api.get.mockResolvedValue({
      data: {
        ...MOCK_RESULT_BASE,
        total_candidate_score: null,
        results: [
          {
            problem_id: 3,
            sequence: 1,
            title: '尚未提交的題',
            max_points: 100,
            candidate_score: null,
            submission_status: 'Unsubmitted',
          },
        ],
      },
    })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('未提交')).toBeInTheDocument()
    })
  })

  // extra: exam title renders in the header
  it('renders the exam title from result payload', async () => {
    api.get.mockResolvedValue({
      data: { ...MOCK_RESULT_BASE, total_candidate_score: 135 },
    })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Spring 2026 面試')).toBeInTheDocument()
    })
  })

  // I-3.1: order_by param wired to backend
  // 註：score_gte / score_lte 已從 ExamResultPage 移除（屬於 ExamListPage 篩選），相關測試見 ExamListPage.test.jsx
  it('sends order_by query parameter to the backend', async () => {
    api.get.mockResolvedValue({
      data: { ...MOCK_RESULT_BASE, total_candidate_score: 135 },
    })

    const { container } = renderPage()

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(`/api/v1/exams/${EXAM_UUID}/result`, { params: {} })
    })

    const orderSelect = container.querySelector('#order-by')

    api.get.mockClear()
    api.get.mockResolvedValue({
      data: { ...MOCK_RESULT_BASE, total_candidate_score: 135 },
    })

    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(orderSelect, { target: { value: 'finished_at' } })
    await waitFor(() => {
      expect(api.get).toHaveBeenLastCalledWith(`/api/v1/exams/${EXAM_UUID}/result`, {
        params: { order_by: 'finished_at' },
      })
    })
  })
})
