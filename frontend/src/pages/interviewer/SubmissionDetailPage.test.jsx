/**
 * Tests for SubmissionDetailPage (P7).
 *
 * 覆蓋場景：
 * (a) presigned_url non-null → window.fetch called with the presigned URL;
 *     api.get NOT called with that URL (core L3 test for the S3 footgun invariant)
 * (b) presigned_url === null → "程式碼暫無法顯示" shown, no fetch() called
 * (c) submission list empty → "考生尚未提交此題" shown, no GET /submissions/{id} call
 * (d) details[] table renders per-testcase rows with JudgeStatusBadge
 * (e) problem_id query param is a Number (api.get called with numeric problem_id=3)
 * (f) header shows resolved candidate username; falls back to UUID when user fetch rejects
 */

import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
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
  Button: ({ children, onClick, disabled, asChild }) => {
    if (asChild) return <span>{children}</span>
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

// --- mock JudgeStatusBadge ---
vi.mock('@/components/JudgeStatusBadge', () => ({
  default: ({ status }) => {
    const LABELS = {
      Accepted: '通過',
      WrongAnswer: '答案錯誤',
      Pending: '待評測',
      Unsubmitted: '未提交',
    }
    return <span data-testid="judge-status-badge">{LABELS[status] ?? status}</span>
  },
}))

import api from '@/lib/api'
import SubmissionDetailPage from './SubmissionDetailPage'

const EXAM_UUID = 'exam-uuid-aaaa-0000-0000-000000000001'
const PROBLEM_ID = '3'
const CANDIDATE_UUID = 'cand-uuid-bbbb-0000-0000-000000000002'
const SUBMISSION_UUID = 'sub-uuid-cccc-0000-0000-000000000003'
const PRESIGNED_URL = 'https://s3.example.com/presigned?token=abc123'

const MOCK_EXAM = {
  id: EXAM_UUID,
  title: 'Spring 2026 面試',
  status: 'Finished',
  candidate_id: CANDIDATE_UUID,
}

const MOCK_SUBMISSION_LIST = [
  { id: SUBMISSION_UUID },
]

const MOCK_SUBMISSION_DETAIL = {
  id: SUBMISSION_UUID,
  user_id: CANDIDATE_UUID,
  language: 'python',
  status: 'Accepted',
  score: 100,
  execution_time: 42,
  presigned_url: PRESIGNED_URL,
  details: [
    { id: 1, testcase_id: 1, status: 'Accepted', score: 50, execution_time: 20 },
    { id: 2, testcase_id: 2, status: 'Accepted', score: 50, execution_time: 22 },
  ],
}

const MOCK_PROBLEM = {
  id: Number(PROBLEM_ID),
  title: '費波那契數列',
  description: '計算第 n 個費波那契數',
  difficulty: 'Easy',
}

const MOCK_CANDIDATE_USER = {
  id: CANDIDATE_UUID,
  username: 'alice',
  full_name: '愛麗絲',
  role: 'Candidate',
}

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={[`/interviewer/exams/${EXAM_UUID}/problems/${PROBLEM_ID}`]}
    >
      <Routes>
        <Route
          path="/interviewer/exams/:examId/problems/:problemId"
          element={<SubmissionDetailPage />}
        />
      </Routes>
    </MemoryRouter>
  )
}

describe('SubmissionDetailPage', () => {
  let fetchSpy

  beforeEach(() => {
    vi.clearAllMocks()
    // Spy on window.fetch separately — this is what distinguishes plain fetch() from api
    fetchSpy = vi.spyOn(window, 'fetch')
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  // (a) CORE S3 footgun invariant test:
  // presigned_url non-null → window.fetch called with the presigned URL;
  // api.get NOT called with the presigned URL
  // This test fails if `window.fetch(presigned_url)` is replaced with `api.get(presigned_url)`
  it('fetches source code via window.fetch (not api.get) when presigned_url is non-null', async () => {
    api.get
      .mockResolvedValueOnce({ data: MOCK_EXAM })                          // step 1: exam
      .mockResolvedValueOnce({ data: MOCK_SUBMISSION_LIST })               // step 2: submissions list
      .mockResolvedValueOnce({ data: MOCK_SUBMISSION_DETAIL })             // step 3: submission detail
      .mockResolvedValueOnce({ data: MOCK_PROBLEM })                       // step 4: problem
      .mockResolvedValueOnce({ data: MOCK_CANDIDATE_USER })                // step 5: candidate user

    fetchSpy.mockResolvedValue({
      text: async () => 'def fib(n): return n',
    })

    renderPage()

    await waitFor(() => {
      // window.fetch MUST be called with the presigned URL
      expect(fetchSpy).toHaveBeenCalledWith(PRESIGNED_URL)
    })

    // api.get must NOT have been called with the presigned URL at any point
    const apiGetCalls = api.get.mock.calls.map((c) => c[0])
    expect(apiGetCalls.every((url) => url !== PRESIGNED_URL)).toBe(true)

    // Source code text should appear in the <pre>
    await waitFor(() => {
      expect(screen.getByText('def fib(n): return n')).toBeInTheDocument()
    })
  })

  // (b) presigned_url === null → "程式碼暫無法顯示" shown, no fetch() called
  // This test fails if the `presigned_url === null` null-guard is removed
  it('shows "程式碼暫無法顯示" and does not call window.fetch when presigned_url is null', async () => {
    const submissionWithNullUrl = { ...MOCK_SUBMISSION_DETAIL, presigned_url: null }

    api.get
      .mockResolvedValueOnce({ data: MOCK_EXAM })
      .mockResolvedValueOnce({ data: MOCK_SUBMISSION_LIST })
      .mockResolvedValueOnce({ data: submissionWithNullUrl })
      .mockResolvedValueOnce({ data: MOCK_PROBLEM })
      .mockResolvedValueOnce({ data: MOCK_CANDIDATE_USER })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('程式碼暫無法顯示')).toBeInTheDocument()
    })

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  // (c) submission list empty → "考生尚未提交此題" shown, no GET /submissions/{id} call
  // This test fails if the early-return guard on empty submissions list is removed
  it('shows "考生尚未提交此題" when submission list is empty and skips subsequent API calls', async () => {
    api.get
      .mockResolvedValueOnce({ data: MOCK_EXAM })          // step 1: exam
      .mockResolvedValueOnce({ data: [] })                  // step 2: empty submissions

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('考生尚未提交此題')).toBeInTheDocument()
    })

    // api.get should have been called only twice (exam + submissions list)
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(api.get).toHaveBeenCalledWith(`/api/v1/exams/${EXAM_UUID}`)
    expect(api.get).toHaveBeenCalledWith('/api/v1/submissions/', expect.any(Object))

    // No call for submission detail
    const calls = api.get.mock.calls.map((c) => c[0])
    expect(calls.every((url) => !url.includes(`/submissions/${SUBMISSION_UUID}`))).toBe(true)

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  // (d) details[] table renders per-testcase rows with JudgeStatusBadge
  it('renders per-testcase details rows with JudgeStatusBadge', async () => {
    api.get
      .mockResolvedValueOnce({ data: MOCK_EXAM })
      .mockResolvedValueOnce({ data: MOCK_SUBMISSION_LIST })
      .mockResolvedValueOnce({ data: MOCK_SUBMISSION_DETAIL })
      .mockResolvedValueOnce({ data: MOCK_PROBLEM })
      .mockResolvedValueOnce({ data: MOCK_CANDIDATE_USER })

    fetchSpy.mockResolvedValue({ text: async () => '' })

    renderPage()

    await waitFor(() => {
      const badges = screen.getAllByTestId('judge-status-badge')
      // At least 2 badges from the details table (plus potentially one from the submission status)
      expect(badges.length).toBeGreaterThanOrEqual(2)
    })
  })

  // (e) problem_id query param is a Number
  // This test fails if Number(problemId) coercion is removed and a string is sent instead
  it('sends problem_id as a Number in the submissions query (not as a string)', async () => {
    api.get
      .mockResolvedValueOnce({ data: MOCK_EXAM })
      .mockResolvedValueOnce({ data: MOCK_SUBMISSION_LIST })
      .mockResolvedValueOnce({ data: MOCK_SUBMISSION_DETAIL })
      .mockResolvedValueOnce({ data: MOCK_PROBLEM })
      .mockResolvedValueOnce({ data: MOCK_CANDIDATE_USER })

    fetchSpy.mockResolvedValue({ text: async () => '' })

    renderPage()

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/v1/submissions/', {
        params: {
          exam_id: EXAM_UUID,
          problem_id: Number(PROBLEM_ID), // must be 3 (number), not '3' (string)
          user_id: CANDIDATE_UUID,
        },
      })
    })
  })

  // (f) header shows resolved candidate username
  it('shows the resolved candidate username in the header', async () => {
    api.get
      .mockResolvedValueOnce({ data: MOCK_EXAM })
      .mockResolvedValueOnce({ data: MOCK_SUBMISSION_LIST })
      .mockResolvedValueOnce({ data: MOCK_SUBMISSION_DETAIL })
      .mockResolvedValueOnce({ data: MOCK_PROBLEM })
      .mockResolvedValueOnce({ data: MOCK_CANDIDATE_USER })

    fetchSpy.mockResolvedValue({ text: async () => '' })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/考生帳號：alice/)).toBeInTheDocument()
    })
  })

  // (g) Bug 2: 測資詳細資訊欄渲染 runtime_info；judge_log 區塊存在
  it('renders runtime_info per testcase and judge_log summary block', async () => {
    const detailWithRuntimeInfo = {
      ...MOCK_SUBMISSION_DETAIL,
      judge_log: 'NameError: name foo is not defined',
      details: [
        {
          id: 1,
          testcase_id: 1,
          status: 'WrongAnswer',
          score: 0,
          execution_time: 18,
          runtime_info: 'Expected: 7\nGot: 6',
        },
        {
          id: 2,
          testcase_id: 2,
          status: 'Accepted',
          score: 10,
          execution_time: 22,
          runtime_info: null,
        },
      ],
    }
    api.get
      .mockResolvedValueOnce({ data: MOCK_EXAM })
      .mockResolvedValueOnce({ data: MOCK_SUBMISSION_LIST })
      .mockResolvedValueOnce({ data: detailWithRuntimeInfo })
      .mockResolvedValueOnce({ data: MOCK_PROBLEM })
      .mockResolvedValueOnce({ data: MOCK_CANDIDATE_USER })

    fetchSpy.mockResolvedValue({ text: async () => '' })

    renderPage()

    // WA testcase 的 runtime_info Expected/Got 對比
    await waitFor(() => {
      expect(screen.getByText(/Expected: 7/)).toBeInTheDocument()
      expect(screen.getByText(/Got: 6/)).toBeInTheDocument()
    })

    // judge_log 整體錯誤訊息摘要
    expect(screen.getByText('整體錯誤訊息摘要：')).toBeInTheDocument()
    expect(screen.getByText(/NameError/)).toBeInTheDocument()
  })

  // (f) fallback to UUID when candidate user fetch rejects
  it('falls back to candidate_id UUID in header when user fetch rejects', async () => {
    api.get
      .mockResolvedValueOnce({ data: MOCK_EXAM })
      .mockResolvedValueOnce({ data: MOCK_SUBMISSION_LIST })
      .mockResolvedValueOnce({ data: MOCK_SUBMISSION_DETAIL })
      .mockResolvedValueOnce({ data: MOCK_PROBLEM })
      .mockRejectedValueOnce(new Error('user not found')) // candidate user fetch fails

    fetchSpy.mockResolvedValue({ text: async () => '' })

    renderPage()

    await waitFor(() => {
      // Falls back to the candidate_id UUID from the exam
      expect(screen.getByText(new RegExp(`考生帳號：${CANDIDATE_UUID}`))).toBeInTheDocument()
    })
  })
})
