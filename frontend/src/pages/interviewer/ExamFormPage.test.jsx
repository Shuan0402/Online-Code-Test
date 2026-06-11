import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import api from '@/lib/api'
import ExamFormPage from './ExamFormPage'

// --- mock @/lib/api ---
vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

// --- mock components ---
vi.mock('@/components/LoadingSpinner', () => ({
  default: () => <div data-testid="loading-spinner" />,
}))

vi.mock('@/components/ErrorMessage', () => ({
  default: ({ message }) => (
    <div data-testid="error-message">
      <span>{message}</span>
    </div>
  ),
}))

// --- mock ui components ---
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, type, variant }) => (
    <button onClick={onClick} disabled={disabled} type={type} data-variant={variant}>
      {children}
    </button>
  ),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const MOCK_USERS_WITH_CANDIDATES = [
  { id: 'user-1', username: 'cand1', full_name: 'Candidate One', role: 'Candidate' },
  { id: 'user-2', username: 'cand2', full_name: '', role: 'Candidate' },
  { id: 'user-3', username: 'interviewer1', full_name: 'Interviewer One', role: 'Interviewer' },
]

const MOCK_PROBLEMS = [
  { id: 101, difficulty: 'Easy' },
  { id: 102, difficulty: 'Easy' },
  { id: 103, difficulty: 'Medium' },
]

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/interviewer/exams/new']}>
      <Routes>
        <Route path="/interviewer/exams/new" element={<ExamFormPage />} />
      </Routes>
    </MemoryRouter>
  )
}

function setupGetMocks({ users = MOCK_USERS_WITH_CANDIDATES, problems = MOCK_PROBLEMS, tags = [] } = {}) {
  api.get.mockImplementation((url) => {
    if (url.includes('/users/')) return Promise.resolve({ data: users })
    if (url.includes('/problems/')) return Promise.resolve({ data: problems })
    if (url.includes('/exams/tags')) return Promise.resolve({ data: tags })
    return Promise.reject(new Error('Unknown url: ' + url))
  })
}

describe('ExamFormPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders loading spinner initially', () => {
    api.get.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
  })

  it('renders error message if fetching candidates fails', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/users/')) return Promise.reject({ response: { data: { detail: 'Load Candidates Failed' } } })
      return Promise.resolve({ data: [] })
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeInTheDocument()
      expect(screen.getByText('Load Candidates Failed')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '返回列表' }))
    expect(mockNavigate).toHaveBeenCalledWith('/interviewer')
  })

  it('renders error message fallback if error response detail is missing', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/users/')) return Promise.reject(new Error('Network error'))
      return Promise.resolve({ data: [] })
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('無法載入應試者清單，請稍後再試')).toBeInTheDocument()
    })
  })

  it('renders form successfully and displays warning when input exceeds bank stats', async () => {
    setupGetMocks()

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('新增考試')).toBeInTheDocument()
    })

    // Assert that candidates list filtered by role === 'Candidate'
    const select = screen.getByLabelText('應試者')
    expect(select).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Candidate One' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'cand2' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'interviewer1' })).not.toBeInTheDocument()

    // Assert stats labels
    expect(screen.getByText('題庫可用：2')).toBeInTheDocument() // Easy
    expect(screen.getByText('題庫可用：1')).toBeInTheDocument() // Medium
    expect(screen.getByText('題庫可用：0')).toBeInTheDocument() // Hard

    // Exceed Stats Warning should not be visible initially
    expect(screen.queryByText(/設定的題數超過題庫可用量/)).not.toBeInTheDocument()

    // Change easy count to 3 (which exceeds 2)
    const easyInput = screen.getByLabelText('簡單題數')
    fireEvent.change(easyInput, { target: { value: '3' } })

    // Change medium count to 2 (which exceeds 1)
    const mediumInput = screen.getByLabelText('中等題數')
    fireEvent.change(mediumInput, { target: { value: '2' } })

    // Change hard count to 1 (which exceeds 0)
    const hardInput = screen.getByLabelText('困難題數')
    fireEvent.change(hardInput, { target: { value: '1' } })

    await waitFor(() => {
      expect(screen.getByText(/設定的題數超過題庫可用量/)).toBeInTheDocument()
      expect(screen.getByText(/簡單：要 3、有 2/)).toBeInTheDocument()
      expect(screen.getByText(/中等：要 2、有 1/)).toBeInTheDocument()
      expect(screen.getByText(/困難：要 1、有 0/)).toBeInTheDocument()
    })
  })

  it('handles empty candidates list correctly', async () => {
    setupGetMocks({ users: [] })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('目前系統中沒有可選擇的應試者，請先由管理員建立應試者帳號')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '建立考試' })).toBeDisabled()
    })
  })

  it('performs frontend validations on submit', async () => {
    setupGetMocks()

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('新增考試')).toBeInTheDocument()
    })

    const submitBtn = screen.getByRole('button', { name: '建立考試' })

    // 1. Submit without title
    fireEvent.click(submitBtn)
    await waitFor(() => {
      expect(screen.getByText('請填寫考試標題')).toBeInTheDocument()
    })

    // Fill title
    const titleInput = screen.getByLabelText('考試標題')
    fireEvent.change(titleInput, { target: { value: '  Midterm Exam  ' } })

    // 2. Submit without candidate selected
    fireEvent.click(submitBtn)
    await waitFor(() => {
      expect(screen.getByText('請選擇應試者')).toBeInTheDocument()
      expect(screen.queryByText('請填寫考試標題')).not.toBeInTheDocument()
    })
  })

  it('submits form successfully and navigates to details', async () => {
    setupGetMocks({ tags: ['2026 校招'] })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('新增考試')).toBeInTheDocument()
    })

    // Fill Title
    fireEvent.change(screen.getByLabelText('考試標題'), { target: { value: 'Final Exam' } })
    // Fill Tag
    fireEvent.change(screen.getByLabelText('考試標籤'), { target: { value: '2026 校招' } })
    // Fill Duration
    fireEvent.change(screen.getByLabelText('考試時長（分鐘）'), { target: { value: '180' } })
    // Fill Counts
    fireEvent.change(screen.getByLabelText('簡單題數'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('中等題數'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('困難題數'), { target: { value: '0' } })
    // Select Candidate
    fireEvent.change(screen.getByLabelText('應試者'), { target: { value: 'user-1' } })

    api.post.mockResolvedValueOnce({ data: { id: 'new-exam-id-123' } })

    fireEvent.click(screen.getByRole('button', { name: '建立考試' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/v1/exams/', {
        title: 'Final Exam',
        tag: '2026 校招',
        duration_minutes: 180,
        easy_count: 1,
        medium_count: 1,
        hard_count: 0,
        candidate_id: 'user-1',
      })
      expect(mockNavigate).toHaveBeenCalledWith('/interviewer/exams/new-exam-id-123')
    })
  })

  it('uses fallbacks on submit if input values are invalid', async () => {
    setupGetMocks()

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('新增考試')).toBeInTheDocument()
    })

    // Fill Title
    fireEvent.change(screen.getByLabelText('考試標題'), { target: { value: 'Final Exam' } })
    // Fill invalid values
    fireEvent.change(screen.getByLabelText('考試時長（分鐘）'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('簡單題數'), { target: { value: 'abc' } })
    fireEvent.change(screen.getByLabelText('中等題數'), { target: { value: 'xyz' } })
    fireEvent.change(screen.getByLabelText('困難題數'), { target: { value: 'def' } })
    // Select Candidate
    fireEvent.change(screen.getByLabelText('應試者'), { target: { value: 'user-2' } })

    api.post.mockResolvedValueOnce({ data: { id: 'new-exam-id-123' } })

    fireEvent.click(screen.getByRole('button', { name: '建立考試' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/v1/exams/', {
        title: 'Final Exam',
        tag: null,
        duration_minutes: 120, // default fallback
        easy_count: 0, // default fallback
        medium_count: 0, // default fallback
        hard_count: 0, // default fallback
        candidate_id: 'user-2',
      })
    })
  })

  it('renders submit failure error message', async () => {
    setupGetMocks()

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('新增考試')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('考試標題'), { target: { value: 'Final Exam' } })
    fireEvent.change(screen.getByLabelText('應試者'), { target: { value: 'user-1' } })

    api.post.mockRejectedValueOnce({ response: { data: { detail: 'Create Exam Failed Detail' } } })

    fireEvent.click(screen.getByRole('button', { name: '建立考試' }))

    await waitFor(() => {
      expect(screen.getByText('Create Exam Failed Detail')).toBeInTheDocument()
    })
  })

  it('renders default submit failure error message if detail is missing', async () => {
    setupGetMocks()

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('新增考試')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('考試標題'), { target: { value: 'Final Exam' } })
    fireEvent.change(screen.getByLabelText('應試者'), { target: { value: 'user-1' } })

    api.post.mockRejectedValueOnce(new Error('Unknown API error'))

    fireEvent.click(screen.getByRole('button', { name: '建立考試' }))

    await waitFor(() => {
      expect(screen.getByText('建立失敗，請稍後再試')).toBeInTheDocument()
    })
  })

  it('handles problem bank stats fetch failure silently', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/users/')) return Promise.resolve({ data: MOCK_USERS_WITH_CANDIDATES })
      if (url.includes('/exams/tags')) return Promise.resolve({ data: [] })
      if (url.includes('/problems/')) return Promise.reject(new Error('Silent stats failure'))
      return Promise.reject(new Error('Unknown url'))
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('新增考試')).toBeInTheDocument()
    })

    // Stats should fall back to 0
    expect(screen.getAllByText('題庫可用：0')).toHaveLength(3)
  })

  it('navigates back to /interviewer on cancel button click', async () => {
    setupGetMocks()

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('新增考試')).toBeInTheDocument()
    })

    // Main header Cancel button
    fireEvent.click(screen.getAllByRole('button', { name: '取消' })[0])
    expect(mockNavigate).toHaveBeenCalledWith('/interviewer')

    // Bottom cancel button
    mockNavigate.mockClear()
    fireEvent.click(screen.getAllByRole('button', { name: '取消' })[1])
    expect(mockNavigate).toHaveBeenCalledWith('/interviewer')
  })

  it('fetches existing tags and renders autocomplete dropdown suggestions', async () => {
    setupGetMocks({ tags: ['TagX', 'TagY'] })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('新增考試')).toBeInTheDocument()
    })

    // Dropdown should be closed initially, so options not visible
    expect(screen.queryByText('TagX')).not.toBeInTheDocument()

    // Focus on tag input to open the dropdown
    const tagInput = screen.getByLabelText('考試標籤')
    fireEvent.focus(tagInput)

    // Dropdown options should now be visible
    expect(screen.getByText('TagX')).toBeInTheDocument()
    expect(screen.getByText('TagY')).toBeInTheDocument()

    // Click on an option TagY
    fireEvent.click(screen.getByText('TagY'))

    // The value of tagInput should be updated
    expect(tagInput.value).toBe('TagY')
  })

  it('filters suggestions and shows option to add new tag when no matches found', async () => {
    setupGetMocks({ tags: ['TagX', 'TagY'] })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('新增考試')).toBeInTheDocument()
    })

    const tagInput = screen.getByLabelText('考試標籤')
    fireEvent.focus(tagInput)
    fireEvent.change(tagInput, { target: { value: 'TagZ' } })

    // TagX and TagY should be filtered out
    expect(screen.queryByText('TagX')).not.toBeInTheDocument()
    expect(screen.queryByText('TagY')).not.toBeInTheDocument()

    // The add new tag option should be visible
    const addOption = screen.getByText('+ 新增標籤「TagZ」')
    expect(addOption).toBeInTheDocument()

    // Click it to confirm/add the tag
    fireEvent.click(addOption)

    // The tag value is confirmed
    expect(tagInput.value).toBe('TagZ')
  })
})

