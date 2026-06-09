import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// --- mock @/lib/api ---
vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

// --- mock shadcn Dialog inline to avoid Radix issues ---
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
  default: ({ message, onRetry }) => (
    <div>
      <span data-testid="error-message">{message}</span>
      {onRetry && <button onClick={onRetry}>重試</button>}
    </div>
  ),
}))

// --- mock MarkdownView ---
vi.mock('@/components/MarkdownView', () => ({
  default: ({ children }) => <div data-testid="markdown">{children}</div>,
}))

// --- mock ExamStatusBadge ---
vi.mock('@/components/ExamStatusBadge', () => ({
  default: ({ status }) => <span data-testid="status-badge">{status}</span>,
}))

import api from '@/lib/api'
import ExamDetailPage from './ExamDetailPage'

const MOCK_EXAM_DRAFT = {
  id: 'exam-1',
  title: 'Python 初階面試',
  duration_minutes: 60,
  status: 'Draft',
  easy_count: 1,
  medium_count: 1,
  hard_count: 0,
  creator_id: 'user-interviewer',
  candidate_id: 'user-candidate',
  exam_problems: [
    { problem_id: 1, title: '兩數相加', difficulty: 'Easy', points: 100 }
  ]
}

const MOCK_USERS = [
  { id: 'user-interviewer', username: 'hr_boss', full_name: '人事主管' },
  { id: 'user-candidate', username: 'demo_candidate', full_name: '面試者小明' },
]

const MOCK_PROBLEM_BANK = [
  { id: 1, title: '兩數相加', difficulty: 'Easy' },
  { id: 2, title: '兩數相乘', difficulty: 'Medium' },
  { id: 3, title: '樹狀遍歷', difficulty: 'Hard' },
]

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: 'exam-1' }),
  }
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/interviewer/exams/exam-1']}>
      <Routes>
        <Route path="/interviewer/exams/:id" element={<ExamDetailPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ExamDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockImplementation((url) => {
      if (url.startsWith('/api/v1/exams/')) {
        return Promise.resolve({ data: MOCK_EXAM_DRAFT })
      }
      if (url === '/api/v1/users/') {
        return Promise.resolve({ data: MOCK_USERS })
      }
      if (url === '/api/v1/problems/') {
        return Promise.resolve({ data: MOCK_PROBLEM_BANK })
      }
      return Promise.reject(new Error('Unknown url'))
    })
  })

  it('renders loading spinner and then details of the exam', async () => {
    renderPage()
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Python 初階面試')).toBeInTheDocument()
    })

    expect(screen.getByText('面試者小明')).toBeInTheDocument()
    expect(screen.getByTestId('status-badge')).toHaveTextContent('Draft')
  })

  it('handles edit fields and saving settings successfully', async () => {
    api.patch.mockResolvedValue({
      data: {
        ...MOCK_EXAM_DRAFT,
        title: '更新後的 Python 面試',
        duration_minutes: 90,
      }
    })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Python 初階面試')).toBeInTheDocument()
    })

    // Modify fields
    const titleInput = screen.getByLabelText('考試名稱')
    fireEvent.change(titleInput, { target: { value: '更新後的 Python 面試' } })

    const durationInput = screen.getByLabelText('考試時長（分鐘）')
    fireEvent.change(durationInput, { target: { value: '90' } })

    fireEvent.click(screen.getByText('儲存設定'))

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/api/v1/exams/exam-1', {
        title: '更新後的 Python 面試',
        duration_minutes: 90,
        easy_count: 1,
        medium_count: 1,
        hard_count: 0,
      })
    })

    await waitFor(() => {
      expect(screen.getByText('更新後的 Python 面試')).toBeInTheDocument()
    })
  })

  it('handles auto-generating problems', async () => {
    api.post.mockResolvedValue({
      data: {
        ...MOCK_EXAM_DRAFT,
        exam_problems: [
          { problem_id: 1, title: '兩數相加', difficulty: 'Easy', points: 100 },
          { problem_id: 2, title: '兩數相乘', difficulty: 'Medium', points: 100 },
        ]
      }
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Python 初階面試')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('自動配置題目'))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/v1/exams/exam-1/problems/generate')
    })

    await waitFor(() => {
      expect(screen.getByText('兩數相乘')).toBeInTheDocument()
    })
  })

  it('handles opening problem picker, previewing and adding a problem', async () => {
    api.post.mockResolvedValue({
      data: {
        ...MOCK_EXAM_DRAFT,
        exam_problems: [
          { problem_id: 1, title: '兩數相加', difficulty: 'Easy', points: 100 },
          { problem_id: 2, title: '兩數相乘', difficulty: 'Medium', points: 100 },
        ]
      }
    })
    api.get.mockImplementation((url) => {
      if (url.startsWith('/api/v1/exams/')) {
        return Promise.resolve({ data: MOCK_EXAM_DRAFT })
      }
      if (url === '/api/v1/users/') {
        return Promise.resolve({ data: MOCK_USERS })
      }
      if (url === '/api/v1/problems/') {
        return Promise.resolve({ data: MOCK_PROBLEM_BANK })
      }
      if (url === '/api/v1/problems/2') {
        return Promise.resolve({ data: { description: '計算 $A \times B$' } })
      }
      return Promise.reject(new Error('Unknown url'))
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Python 初階面試')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('手動選取題目'))

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/v1/problems/')
    })

    await waitFor(() => {
      expect(screen.getByText('兩數相乘')).toBeInTheDocument()
    })

    // Toggle Preview
    fireEvent.click(screen.getByRole('button', { name: '預覽' }))

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/v1/problems/2')
    })
    await waitFor(() => {
      expect(screen.getByTestId('markdown')).toHaveTextContent('計算 $A \times B$')
    })

    // Add Problem
    fireEvent.click(screen.getByRole('button', { name: '加入' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/v1/exams/exam-1/problems', {
        problem_id: 2,
        points: 100,
      })
    })
  })

  it('handles publishing the exam successfully', async () => {
    api.post.mockResolvedValue({
      data: {
        ...MOCK_EXAM_DRAFT,
        status: 'Active'
      }
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Python 初階面試')).toBeInTheDocument()
    })

    // Since easy_count=1, medium_count=1 but actual problems=1 (too few), the button should be disabled.
    // Let's verify it is disabled.
    const publishBtn = screen.getByRole('button', { name: '發佈考試' })
    expect(publishBtn).toBeDisabled()

    // Mock exam where actual count matches expected quota
    api.get.mockImplementation((url) => {
      if (url.startsWith('/api/v1/exams/')) {
        return Promise.resolve({
          data: {
            ...MOCK_EXAM_DRAFT,
            easy_count: 1,
            medium_count: 0,
            hard_count: 0,
          }
        })
      }
      if (url === '/api/v1/users/') {
        return Promise.resolve({ data: MOCK_USERS })
      }
      return Promise.reject(new Error('Unknown url'))
    })

    renderPage()

    await waitFor(() => {
      const publishBtnEnabled = screen.getByRole('button', { name: '發佈考試' })
      expect(publishBtnEnabled).not.toBeDisabled()
      fireEvent.click(publishBtnEnabled)
    })

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/v1/exams/exam-1/publish')
    })
  })

  it('handles deleting the exam successfully', async () => {
    api.delete.mockResolvedValue({ status: 204 })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Python 初階面試')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('刪除考試'))

    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '確認刪除' }))

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/api/v1/exams/exam-1')
    })
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/interviewer')
    })
  })
})
