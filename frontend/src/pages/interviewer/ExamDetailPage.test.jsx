import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import api from '@/lib/api'
import ExamDetailPage from './ExamDetailPage'

// --- mock @/lib/api ---
vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  },
}))

// --- mock components ---
vi.mock('@/components/LoadingSpinner', () => ({
  default: () => <div data-testid="loading-spinner" />,
}))

vi.mock('@/components/ErrorMessage', () => ({
  default: ({ message, onRetry }) => (
    <div data-testid="error-message">
      <span>{message}</span>
      {onRetry && <button onClick={onRetry}>重試</button>}
    </div>
  ),
}))

vi.mock('@/components/ExamStatusBadge', () => ({
  default: ({ status }) => <span data-testid="exam-status-badge">{status}</span>,
}))

vi.mock('@/components/MarkdownView', () => ({
  default: ({ children }) => <div data-testid="mock-markdown">{children}</div>,
}))

// --- mock ui components ---
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, title }) => (
    <button onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open, onOpenChange }) =>
    open ? (
      <div data-testid="mock-dialog">
        <button onClick={() => onOpenChange(false)}>Close Dialog</button>
        {children}
      </div>
    ) : null,
  DialogContent: ({ children }) => <div data-testid="mock-dialog-content">{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
  DialogDescription: ({ children }) => <p>{children}</p>,
  DialogFooter: ({ children }) => <div>{children}</div>,
}))

const EXAM_UUID = 'exam-uuid-1234'

const MOCK_EXAM_DRAFT = {
  id: EXAM_UUID,
  title: 'Spring 2026 Interview',
  duration_minutes: 100,
  status: 'Draft',
  candidate_id: 'user-1',
  easy_count: 2,
  medium_count: 1,
  hard_count: 0,
  exam_problems: [
    { problem_id: 101, title: 'Two Sum', difficulty: 'Easy', points: 100 },
  ],
}

const MOCK_EXAM_PUBLISHED = {
  id: EXAM_UUID,
  title: 'Spring 2026 Interview Published',
  duration_minutes: 120,
  status: 'Published',
  candidate_id: 'user-1',
  easy_count: 2,
  medium_count: 1,
  hard_count: 0,
  exam_problems: [
    { problem_id: 101, title: 'Two Sum', difficulty: 'Easy', points: 100 },
  ],
}

const MOCK_USERS = [
  { id: 'user-1', username: 'cand1', full_name: 'Candidate One' },
  { id: 'user-2', username: 'cand2', full_name: '' },
]

const MOCK_PROBLEMS_BANK = [
  { id: 101, title: 'Two Sum', difficulty: 'Easy' },
  { id: 102, title: 'Reverse String', difficulty: 'Easy' },
  { id: 103, title: 'Number Square', difficulty: 'Medium' },
  { id: 104, title: 'Count Characters', difficulty: 'Hard' },
]

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/interviewer/exams/${EXAM_UUID}`]}>
      <Routes>
        <Route path="/interviewer/exams/:id" element={<ExamDetailPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ExamDetailPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders loading spinner initially', () => {
    api.get.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
  })

  it('renders error message if API fails', async () => {
    api.get.mockRejectedValue({ response: { data: { detail: 'API Error Message' } } })
    renderPage()

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeInTheDocument()
      expect(screen.getByText('API Error Message')).toBeInTheDocument()
    })

    // Click retry
    api.get.mockClear()
    api.get.mockResolvedValueOnce({ data: MOCK_EXAM_DRAFT })
    api.get.mockResolvedValueOnce({ data: MOCK_USERS })

    fireEvent.click(screen.getByRole('button', { name: '重試' }))
    await waitFor(() => {
      expect(screen.getByText('Spring 2026 Interview')).toBeInTheDocument()
    })
  })

  it('renders error message fallback if error detail is missing', async () => {
    api.get.mockRejectedValue(new Error('Generic network error'))
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('載入考試資料失敗，請稍後再試')).toBeInTheDocument()
    })
  })

  it('renders draft exam details and users map correctly', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/exams/')) return Promise.resolve({ data: MOCK_EXAM_DRAFT })
      if (url.includes('/users/')) return Promise.resolve({ data: MOCK_USERS })
      return Promise.reject(new Error('Unknown url'))
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Spring 2026 Interview')).toBeInTheDocument()
      expect(screen.getByText('Candidate One')).toBeInTheDocument()
      expect(screen.getByText(/簡單 2 ／ 中等 1 ／ 困難 0/)).toBeInTheDocument()
    })
  })

  it('renders empty list if exam problems is empty', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/exams/')) return Promise.resolve({ data: { ...MOCK_EXAM_DRAFT, exam_problems: [] } })
      if (url.includes('/users/')) return Promise.resolve({ data: MOCK_USERS })
      return Promise.reject(new Error('Unknown url'))
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('尚未加入任何題目')).toBeInTheDocument()
    })
  })

  it('saves edits successfully', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/exams/tags')) return Promise.resolve({ data: ['TagA', 'TagB'] })
      if (url.includes('/exams/')) return Promise.resolve({ data: MOCK_EXAM_DRAFT })
      if (url.includes('/users/')) return Promise.resolve({ data: MOCK_USERS })
      return Promise.reject(new Error('Unknown url'))
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Spring 2026 Interview')).toBeInTheDocument()
    })

    const titleInput = screen.getByLabelText('考試標題')
    const tagInput = screen.getByLabelText('考試標籤')
    const durationInput = screen.getByLabelText('考試時長（分鐘）')
    const easyInput = screen.getByLabelText('簡單題數')
    const mediumInput = screen.getByLabelText('中等題數')
    const hardInput = screen.getByLabelText('困難題數')

    fireEvent.change(titleInput, { target: { value: 'Updated Title' } })
    fireEvent.change(tagInput, { target: { value: 'NewTag' } })
    fireEvent.change(durationInput, { target: { value: '150' } })
    fireEvent.change(easyInput, { target: { value: '3' } })
    fireEvent.change(mediumInput, { target: { value: '2' } })
    fireEvent.change(hardInput, { target: { value: '1' } })

    api.patch.mockResolvedValueOnce({
      data: {
        ...MOCK_EXAM_DRAFT,
        title: 'Updated Title',
        tag: 'NewTag',
        duration_minutes: 150,
        easy_count: 3,
        medium_count: 2,
        hard_count: 1,
      },
    })

    fireEvent.click(screen.getByRole('button', { name: '儲存設定' }))

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(`/api/v1/exams/${EXAM_UUID}`, {
        title: 'Updated Title',
        tag: 'NewTag',
        duration_minutes: 150,
        easy_count: 3,
        medium_count: 2,
        hard_count: 1,
      })
      expect(screen.getByText('Updated Title')).toBeInTheDocument()
      expect(screen.getByText(/簡單 3 ／ 中等 2 ／ 困難 1/)).toBeInTheDocument()
    })
  })

  it('uses default values on save if inputs are invalid or empty', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/exams/tags')) return Promise.resolve({ data: [] })
      if (url.includes('/exams/')) return Promise.resolve({ data: MOCK_EXAM_DRAFT })
      if (url.includes('/users/')) return Promise.resolve({ data: MOCK_USERS })
      return Promise.reject(new Error('Unknown url'))
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Spring 2026 Interview')).toBeInTheDocument()
    })

    const titleInput = screen.getByLabelText('考試標題')
    const durationInput = screen.getByLabelText('考試時長（分鐘）')
    const easyInput = screen.getByLabelText('簡單題數')

    fireEvent.change(titleInput, { target: { value: '   ' } })
    fireEvent.change(durationInput, { target: { value: '-5' } })
    fireEvent.change(easyInput, { target: { value: '-2' } })

    api.patch.mockResolvedValueOnce({ data: MOCK_EXAM_DRAFT })
    fireEvent.click(screen.getByRole('button', { name: '儲存設定' }))

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(`/api/v1/exams/${EXAM_UUID}`, {
        title: MOCK_EXAM_DRAFT.title,
        tag: null,
        duration_minutes: 120, // default fallback
        easy_count: 0, // default fallback for negative
        medium_count: 1,
        hard_count: 0,
      })
    })
  })

  it('renders error on save failure', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/exams/')) return Promise.resolve({ data: MOCK_EXAM_DRAFT })
      if (url.includes('/users/')) return Promise.resolve({ data: MOCK_USERS })
      return Promise.reject(new Error('Unknown url'))
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Spring 2026 Interview')).toBeInTheDocument()
    })

    api.patch.mockRejectedValueOnce({ response: { data: { detail: 'Save Error' } } })
    fireEvent.click(screen.getByRole('button', { name: '儲存設定' }))

    await waitFor(() => {
      expect(screen.getByText('Save Error')).toBeInTheDocument()
    })
  })

  it('blocks edit on save if not a draft', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/exams/')) return Promise.resolve({ data: MOCK_EXAM_PUBLISHED })
      if (url.includes('/users/')) return Promise.resolve({ data: MOCK_USERS })
      return Promise.reject(new Error('Unknown url'))
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Spring 2026 Interview Published')).toBeInTheDocument()
    })

    const titleInput = screen.getByLabelText('考試標題')
    const form = titleInput.closest('form')
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByText('非草稿狀態不可編輯')).toBeInTheDocument()
    })
  })

  it('auto generates problems successfully', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/exams/')) return Promise.resolve({ data: MOCK_EXAM_DRAFT })
      if (url.includes('/users/')) return Promise.resolve({ data: MOCK_USERS })
      return Promise.reject(new Error('Unknown url'))
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Spring 2026 Interview')).toBeInTheDocument()
    })

    api.post.mockResolvedValueOnce({
      data: {
        ...MOCK_EXAM_DRAFT,
        exam_problems: [
          { problem_id: 101, title: 'Two Sum', difficulty: 'Easy', points: 100 },
          { problem_id: 102, title: 'Reverse String', difficulty: 'Easy', points: 100 },
        ],
      },
    })

    fireEvent.click(screen.getByRole('button', { name: '自動生成題目' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(`/api/v1/exams/${EXAM_UUID}/problems/generate`)
      expect(screen.getByText('Reverse String')).toBeInTheDocument()
    })
  })

  it('renders error on auto generate failure', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/exams/')) return Promise.resolve({ data: MOCK_EXAM_DRAFT })
      if (url.includes('/users/')) return Promise.resolve({ data: MOCK_USERS })
      return Promise.reject(new Error('Unknown url'))
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Spring 2026 Interview')).toBeInTheDocument()
    })

    api.post.mockRejectedValueOnce({ response: { data: { detail: 'Generate Fail' } } })
    fireEvent.click(screen.getByRole('button', { name: '自動生成題目' }))

    await waitFor(() => {
      expect(screen.getByText('Generate Fail')).toBeInTheDocument()
    })
  })

  it('manages manual problem picker successfully', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes(`/exams/${EXAM_UUID}`)) return Promise.resolve({ data: MOCK_EXAM_DRAFT })
      if (url.includes('/users/')) return Promise.resolve({ data: MOCK_USERS })
      if (url.includes('/problems/')) return Promise.resolve({ data: MOCK_PROBLEMS_BANK })
      return Promise.reject(new Error('Unknown url'))
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Spring 2026 Interview')).toBeInTheDocument()
    })

    // Open Picker
    fireEvent.click(screen.getByRole('button', { name: '新增題目' }))

    await waitFor(() => {
      expect(screen.getByTestId('mock-dialog')).toBeInTheDocument()
      expect(screen.getByText('Reverse String')).toBeInTheDocument()
      
      const dialogContent = screen.getByTestId('mock-dialog-content')
      expect(within(dialogContent).queryByText('Two Sum')).not.toBeInTheDocument()
    })

    // Toggle Preview - Mocking problem detail get call
    api.get.mockImplementation((url) => {
      if (url.includes('/problems/102')) {
        return Promise.resolve({ data: { id: 102, description: 'Reverse String Description' } })
      }
      return Promise.reject(new Error('Unknown url'))
    })

    const rowReverse = screen.getByText('Reverse String').closest('tr')
    const rowCount = screen.getByText('Count Characters').closest('tr')

    fireEvent.click(within(rowReverse).getByRole('button', { name: '預覽' }))

    await waitFor(() => {
      expect(screen.getByTestId('mock-markdown')).toBeInTheDocument()
      expect(screen.getByText('Reverse String Description')).toBeInTheDocument()
    })

    // Collapse Preview
    fireEvent.click(within(rowReverse).getByRole('button', { name: '收合' }))
    await waitFor(() => {
      expect(screen.queryByTestId('mock-markdown')).not.toBeInTheDocument()
    })

    // Add Problem with quota error (e.g. limit is 2 easy, currently has 1, so adding 102 is ok. But medium limit is 1, currently 0, adding 103 is ok. Hard limit is 0, adding 104 should fail due to quota limit.)
    // Let's click Add on Hard problem (104)
    fireEvent.click(within(rowCount).getByRole('button', { name: '加入' }))
    await waitFor(() => {
      expect(screen.getByText('已達困難題數上限（0）')).toBeInTheDocument()
    })

    // Add Problem successfully
    api.post.mockResolvedValueOnce({
      data: {
        ...MOCK_EXAM_DRAFT,
        exam_problems: [
          { problem_id: 101, title: 'Two Sum', difficulty: 'Easy', points: 100 },
          { problem_id: 102, title: 'Reverse String', difficulty: 'Easy', points: 100 },
        ],
      },
    })

    fireEvent.click(within(rowReverse).getByRole('button', { name: '加入' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(`/api/v1/exams/${EXAM_UUID}/problems`, {
        problem_id: 102,
        points: 100,
      })
    })

    // Close Dialog
    fireEvent.click(screen.getByRole('button', { name: 'Close Dialog' }))
    await waitFor(() => {
      expect(screen.queryByTestId('mock-dialog')).not.toBeInTheDocument()
    })

    // Open and close using inner "關閉" button
    fireEvent.click(screen.getByRole('button', { name: '新增題目' }))
    await waitFor(() => {
      expect(screen.getByTestId('mock-dialog')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: '關閉' }))
    await waitFor(() => {
      expect(screen.queryByTestId('mock-dialog')).not.toBeInTheDocument()
    })
  })

  it('handles bank loading error and details load error in picker', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes(`/exams/${EXAM_UUID}`)) return Promise.resolve({ data: MOCK_EXAM_DRAFT })
      if (url.includes('/users/')) return Promise.resolve({ data: MOCK_USERS })
      if (url.includes('/problems/')) return Promise.reject({ response: { data: { detail: 'Bank Error' } } })
      return Promise.reject(new Error('Unknown url'))
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Spring 2026 Interview')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '新增題目' }))

    await waitFor(() => {
      expect(screen.getByText('Bank Error')).toBeInTheDocument()
    })
  })

  it('renders loading in picker when loading', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes(`/exams/${EXAM_UUID}`)) return Promise.resolve({ data: MOCK_EXAM_DRAFT })
      if (url.includes('/users/')) return Promise.resolve({ data: MOCK_USERS })
      if (url.includes('/problems/')) return new Promise(() => {}) // pending
      return Promise.reject(new Error('Unknown url'))
    })

    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Spring 2026 Interview')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '新增題目' }))
    await waitFor(() => {
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
    })
  })

  it('renders empty message in picker if bank is empty', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes(`/exams/${EXAM_UUID}`)) return Promise.resolve({ data: MOCK_EXAM_DRAFT })
      if (url.includes('/users/')) return Promise.resolve({ data: MOCK_USERS })
      if (url.includes('/problems/')) return Promise.resolve({ data: [] })
      return Promise.reject(new Error('Unknown url'))
    })

    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Spring 2026 Interview')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '新增題目' }))
    await waitFor(() => {
      expect(screen.getByText('題庫中尚無題目')).toBeInTheDocument()
    })
  })

  it('removes a problem successfully', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes(`/exams/${EXAM_UUID}`)) return Promise.resolve({ data: MOCK_EXAM_DRAFT })
      if (url.includes('/users/')) return Promise.resolve({ data: MOCK_USERS })
      return Promise.reject(new Error('Unknown url'))
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Spring 2026 Interview')).toBeInTheDocument()
    })

    api.delete.mockResolvedValueOnce({})
    fireEvent.click(screen.getByRole('button', { name: '移除' }))

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith(`/api/v1/exams/${EXAM_UUID}/problems/101`)
      expect(screen.queryByText('Two Sum')).not.toBeInTheDocument()
    })
  })

  it('publishes exam successfully', async () => {
    const fullyPopulatedExam = {
      ...MOCK_EXAM_DRAFT,
      exam_problems: [
        { problem_id: 101, title: 'Two Sum', difficulty: 'Easy', points: 100 },
        { problem_id: 102, title: 'Reverse String', difficulty: 'Easy', points: 100 },
        { problem_id: 103, title: 'Number Square', difficulty: 'Medium', points: 100 },
      ],
    }

    api.get.mockImplementation((url) => {
      if (url.includes(`/exams/${EXAM_UUID}`)) return Promise.resolve({ data: fullyPopulatedExam })
      if (url.includes('/users/')) return Promise.resolve({ data: MOCK_USERS })
      return Promise.reject(new Error('Unknown url'))
    })

    renderPage()

    let activePublishButton
    await waitFor(() => {
      activePublishButton = screen.getByRole('button', { name: '發佈考試' })
      expect(activePublishButton).not.toBeDisabled()
    })

    api.post.mockResolvedValueOnce({
      data: {
        ...fullyPopulatedExam,
        status: 'Published',
      },
    })

    fireEvent.click(activePublishButton)

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(`/api/v1/exams/${EXAM_UUID}/publish`)
      expect(screen.getByTestId('exam-status-badge')).toHaveTextContent('Published')
    })
  })

  it('handles delete exam modal, cancellation, and success', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes(`/exams/${EXAM_UUID}`)) return Promise.resolve({ data: MOCK_EXAM_DRAFT })
      if (url.includes('/users/')) return Promise.resolve({ data: MOCK_USERS })
      return Promise.reject(new Error('Unknown url'))
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Spring 2026 Interview')).toBeInTheDocument()
    })

    // Click Delete Exam button
    fireEvent.click(screen.getByRole('button', { name: '刪除考試' }))
    expect(screen.getByTestId('mock-dialog')).toBeInTheDocument()

    // Cancel deletion
    fireEvent.click(screen.getByRole('button', { name: 'Close Dialog' }))
    expect(screen.queryByTestId('mock-dialog')).not.toBeInTheDocument()

    // Cancel deletion using inner "取消" button
    fireEvent.click(screen.getByRole('button', { name: '刪除考試' }))
    expect(screen.getByTestId('mock-dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByTestId('mock-dialog')).not.toBeInTheDocument()

    // Open again and confirm deletion
    fireEvent.click(screen.getByRole('button', { name: '刪除考試' }))
    api.delete.mockResolvedValueOnce({})
    fireEvent.click(screen.getByRole('button', { name: '確認刪除' }))

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith(`/api/v1/exams/${EXAM_UUID}`)
      expect(mockNavigate).toHaveBeenCalledWith('/interviewer')
    })
  })

  it('handles delete failure error', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes(`/exams/${EXAM_UUID}`)) return Promise.resolve({ data: MOCK_EXAM_DRAFT })
      if (url.includes('/users/')) return Promise.resolve({ data: MOCK_USERS })
      return Promise.reject(new Error('Unknown url'))
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Spring 2026 Interview')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '刪除考試' }))
    api.delete.mockRejectedValueOnce({ response: { data: { detail: 'Delete failed' } } })
    fireEvent.click(screen.getByRole('button', { name: '確認刪除' }))

    await waitFor(() => {
      expect(screen.getByText('Delete failed')).toBeInTheDocument()
    })
  })

  it('handles remove problem failure', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes(`/exams/${EXAM_UUID}`)) return Promise.resolve({ data: MOCK_EXAM_DRAFT })
      if (url.includes('/users/')) return Promise.resolve({ data: MOCK_USERS })
      return Promise.reject(new Error('Unknown url'))
    })

    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Spring 2026 Interview')).toBeInTheDocument()
    })

    api.delete.mockRejectedValueOnce({ response: { data: { detail: 'Remove failed' } } })
    fireEvent.click(screen.getByRole('button', { name: '移除' }))

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith(`/api/v1/exams/${EXAM_UUID}/problems/101`)
      expect(alertSpy).toHaveBeenCalledWith('Remove failed')
    })
  })

  it('handles publish failure error', async () => {
    const fullyPopulatedExam = {
      ...MOCK_EXAM_DRAFT,
      exam_problems: [
        { problem_id: 101, title: 'Two Sum', difficulty: 'Easy', points: 100 },
        { problem_id: 102, title: 'Reverse String', difficulty: 'Easy', points: 100 },
        { problem_id: 103, title: 'Number Square', difficulty: 'Medium', points: 100 },
      ],
    }

    api.get.mockImplementation((url) => {
      if (url.includes(`/exams/${EXAM_UUID}`)) return Promise.resolve({ data: fullyPopulatedExam })
      if (url.includes('/users/')) return Promise.resolve({ data: MOCK_USERS })
      return Promise.reject(new Error('Unknown url'))
    })

    renderPage()

    let activePublishButton
    await waitFor(() => {
      activePublishButton = screen.getByRole('button', { name: '發佈考試' })
      expect(activePublishButton).not.toBeDisabled()
    })

    api.post.mockRejectedValueOnce({ response: { data: { detail: 'Publish failed' } } })
    fireEvent.click(activePublishButton)

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(`/api/v1/exams/${EXAM_UUID}/publish`)
      expect(screen.getByText('Publish failed')).toBeInTheDocument()
    })
  })

  it('handles problem description load failure in picker', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes(`/exams/${EXAM_UUID}`)) return Promise.resolve({ data: MOCK_EXAM_DRAFT })
      if (url.includes('/users/')) return Promise.resolve({ data: MOCK_USERS })
      if (url.includes('/problems/')) return Promise.resolve({ data: MOCK_PROBLEMS_BANK })
      return Promise.reject(new Error('Unknown url'))
    })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Spring 2026 Interview')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '新增題目' }))

    await waitFor(() => {
      expect(screen.getByTestId('mock-dialog')).toBeInTheDocument()
    })

    api.get.mockImplementation((url) => {
      if (url.includes('/problems/102')) {
        return Promise.reject(new Error('Description fetch failed'))
      }
      return Promise.reject(new Error('Unknown url'))
    })

    const rowReverse = screen.getByText('Reverse String').closest('tr')
    fireEvent.click(within(rowReverse).getByRole('button', { name: '預覽' }))

    await waitFor(() => {
      expect(screen.getByText('（此題目沒有描述）')).toBeInTheDocument()
      expect(consoleSpy).toHaveBeenCalled()
    })
    consoleSpy.mockRestore()
  })

  it('handles add problem failure in picker', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes(`/exams/${EXAM_UUID}`)) return Promise.resolve({ data: MOCK_EXAM_DRAFT })
      if (url.includes('/users/')) return Promise.resolve({ data: MOCK_USERS })
      if (url.includes('/problems/')) return Promise.resolve({ data: MOCK_PROBLEMS_BANK })
      return Promise.reject(new Error('Unknown url'))
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Spring 2026 Interview')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '新增題目' }))

    await waitFor(() => {
      expect(screen.getByTestId('mock-dialog')).toBeInTheDocument()
    })

    api.post.mockRejectedValueOnce({ response: { data: { detail: 'Add problem failed' } } })
    const rowReverse = screen.getByText('Reverse String').closest('tr')
    fireEvent.click(within(rowReverse).getByRole('button', { name: '加入' }))

    await waitFor(() => {
      expect(screen.getByText('Add problem failed')).toBeInTheDocument()
    })
  })

  it('renders fallback candidate name if candidate not found or missing', async () => {
    // 1. Not in users map
    api.get.mockImplementation((url) => {
      if (url.includes('/exams/')) return Promise.resolve({ data: { ...MOCK_EXAM_DRAFT, candidate_id: 'user-999' } })
      if (url.includes('/users/')) return Promise.resolve({ data: MOCK_USERS })
      return Promise.reject(new Error('Unknown url'))
    })

    const { unmount } = renderPage()

    await waitFor(() => {
      expect(screen.getByText('user-999')).toBeInTheDocument()
    })

    unmount()

    // 2. Candidate id is missing/null
    api.get.mockImplementation((url) => {
      if (url.includes('/exams/')) return Promise.resolve({ data: { ...MOCK_EXAM_DRAFT, candidate_id: null } })
      if (url.includes('/users/')) return Promise.resolve({ data: MOCK_USERS })
      return Promise.reject(new Error('Unknown url'))
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    })
  })
})
