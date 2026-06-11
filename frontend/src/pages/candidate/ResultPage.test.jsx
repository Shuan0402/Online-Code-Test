import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import api from '@/lib/api'
import ResultPage from './ResultPage'

// Mock navigate and params
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: 'ex-123' }),
  }
})

// Mock api
vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

const mockedApi = vi.mocked(api)

function renderPage() {
  return render(
    <MemoryRouter>
      <ResultPage />
    </MemoryRouter>
  )
}

describe('ResultPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading spinner initially and fetches data on mount', async () => {
    let resolveGet
    const promise = new Promise((resolve) => { resolveGet = resolve })
    mockedApi.get.mockReturnValue(promise)

    renderPage()

    expect(screen.getByLabelText('載入中')).toBeInTheDocument()
    expect(mockedApi.get).toHaveBeenCalledWith('/api/v1/exams/ex-123/result')

    // Clean up
    resolveGet({ data: { title: 'Exam', results: [] } })
    await waitFor(() => expect(screen.queryByLabelText('載入中')).not.toBeInTheDocument())
  })

  it('renders error message when API fails and retries on click', async () => {
    mockedApi.get.mockRejectedValueOnce({
      response: { data: { detail: 'API Error' } },
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('API Error')).toBeInTheDocument()
    })

    // Now set it to succeed on retry
    mockedApi.get.mockResolvedValueOnce({
      data: {
        title: 'Exam A',
        results: [],
      },
    })

    const retryButton = screen.getByRole('button', { name: '重試' })
    fireEvent.click(retryButton)

    expect(screen.getByLabelText('載入中')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Exam A')).toBeInTheDocument()
    })
  })

  it('uses default error message when error response does not have detail', async () => {
    mockedApi.get.mockRejectedValueOnce(new Error('Network failure'))

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('無法載入考試結果，請稍後再試。')).toBeInTheDocument()
    })
  })

  it('uses default error message when error response exists but data detail is missing', async () => {
    mockedApi.get.mockRejectedValueOnce({
      response: { data: {} }
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('無法載入考試結果，請稍後再試。')).toBeInTheDocument()
    })
  })

  it('renders result summary and problem list when API succeeds', async () => {
    const mockResult = {
      title: '模擬面試考題',
      results: [
        { problem_id: 1, title: 'Two Sum', submission_status: 'AC' },
        { problem_id: 2, title: 'Three Sum', submission_status: 'WA' },
      ],
    }
    mockedApi.get.mockResolvedValueOnce({ data: mockResult })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('模擬面試考題')).toBeInTheDocument()
    })

    // Verify stats
    // results has 1 AC, 1 WA -> 答對 1 / 共 2 題
    expect(screen.getByText(/答對 1/)).toBeInTheDocument()
    expect(screen.getByText(/\/ 共 2 題/)).toBeInTheDocument()

    // Table checks
    expect(screen.getByText('Two Sum')).toBeInTheDocument()
    expect(screen.getByText('Three Sum')).toBeInTheDocument()
    expect(screen.getByText('已答對')).toBeInTheDocument()
    expect(screen.getByText('未答對')).toBeInTheDocument()

    // Navigate button
    const backButton = screen.getByRole('button', { name: '返回考試列表' })
    fireEvent.click(backButton)
    expect(mockNavigate).toHaveBeenCalledWith('/candidate/exams')
  })

  it('renders empty message when exam has no problems', async () => {
    mockedApi.get.mockResolvedValueOnce({
      data: {
        title: 'Empty Exam',
        results: [],
      },
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('此次考試沒有題目記錄。')).toBeInTheDocument()
    })
  })

  it('toggles detail section and fetches detail data when clicking expand', async () => {
    const mockResult = {
      title: 'Exam X',
      results: [
        { problem_id: 42, title: 'Problem 42', submission_status: 'WA' },
      ],
    }
    mockedApi.get.mockResolvedValueOnce({ data: mockResult })

    // Stub for details GET
    const mockSubmission = {
      judge_log: 'Some error logs',
      details: [
        { id: 't1', status: 'WA', execution_time: 150, runtime_info: 'Expected 3, got 4' },
        { id: 't2', status: 'AC', execution_time: 80, runtime_info: null },
      ],
    }
    mockedApi.get.mockImplementation((url, config) => {
      if (url === '/api/v1/submissions/latest') {
        return Promise.resolve({ data: mockSubmission })
      }
      return Promise.resolve({ data: mockResult })
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Problem 42')).toBeInTheDocument()
    })

    const expandButton = screen.getByRole('button', { name: '展開明細' })
    fireEvent.click(expandButton)

    // Verify it fetches submissions/latest with correct parameters
    await waitFor(() => {
      expect(mockedApi.get).toHaveBeenCalledWith('/api/v1/submissions/latest', {
        params: { problem_id: 42, exam_id: 'ex-123' },
      })
    })

    // Verify detail data rendered
    await waitFor(() => {
      expect(screen.getByText('Some error logs')).toBeInTheDocument()
      expect(screen.getByText('#1')).toBeInTheDocument()
      expect(screen.getByText('150 ms')).toBeInTheDocument()
      expect(screen.getByText('Expected 3, got 4')).toBeInTheDocument()
      expect(screen.getByText('#2')).toBeInTheDocument()
      expect(screen.getByText('80 ms')).toBeInTheDocument()
      expect(screen.getByText('通過')).toBeInTheDocument()
    })

    // Click collapse
    const collapseButton = screen.getByRole('button', { name: '收合明細' })
    fireEvent.click(collapseButton)

    expect(screen.queryByText('Some error logs')).not.toBeInTheDocument()

    // Expand again - should not hit API again (mockedApi.get was called twice overall - once for result, once for latest)
    fireEvent.click(screen.getByRole('button', { name: '展開明細' }))
    expect(screen.getByText('Some error logs')).toBeInTheDocument()
    expect(mockedApi.get).toHaveBeenCalledTimes(2) // No third call!
  })

  it('handles 404 error when fetching detail', async () => {
    const mockResult = {
      title: 'Exam Y',
      results: [
        { problem_id: 10, title: 'Problem 10', submission_status: 'WA' },
      ],
    }
    mockedApi.get.mockImplementation((url) => {
      if (url === '/api/v1/submissions/latest') {
        return Promise.reject({ response: { status: 404 } })
      }
      return Promise.resolve({ data: mockResult })
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Problem 10')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '展開明細' }))

    await waitFor(() => {
      expect(screen.getByText('尚未提交本題')).toBeInTheDocument()
    })
  })

  it('handles non-404 error when fetching detail', async () => {
    const mockResult = {
      title: 'Exam Z',
      results: [
        { problem_id: 20, title: 'Problem 20', submission_status: 'WA' },
      ],
    }
    mockedApi.get.mockImplementation((url) => {
      if (url === '/api/v1/submissions/latest') {
        return Promise.reject({ response: { status: 500 } })
      }
      return Promise.resolve({ data: mockResult })
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Problem 20')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '展開明細' }))

    await waitFor(() => {
      expect(screen.getByText('無法載入明細')).toBeInTheDocument()
    })
  })

  it('renders correctly when submission details are empty', async () => {
    const mockResult = {
      title: 'Exam W',
      results: [
        { problem_id: 30, title: 'Problem 30', submission_status: 'AC' },
      ],
    }
    const mockSubmission = {
      details: [],
    }
    mockedApi.get.mockImplementation((url) => {
      if (url === '/api/v1/submissions/latest') {
        return Promise.resolve({ data: mockSubmission })
      }
      return Promise.resolve({ data: mockResult })
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Problem 30')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '展開明細' }))

    await waitFor(() => {
      expect(screen.getByText('此次提交尚無 testcase 明細。')).toBeInTheDocument()
    })
  })

  it('displays placeholder dashes when execution_time is null and status is not AC', async () => {
    const mockResult = {
      title: 'Exam V',
      results: [
        { problem_id: 40, title: 'Problem 40', submission_status: 'WA' },
      ],
    }
    const mockSubmission = {
      details: [
        { id: 't1', status: 'WA', execution_time: null, runtime_info: null },
      ],
    }
    mockedApi.get.mockImplementation((url) => {
      if (url === '/api/v1/submissions/latest') {
        return Promise.resolve({ data: mockSubmission })
      }
      return Promise.resolve({ data: mockResult })
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Problem 40')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '展開明細' }))

    await waitFor(() => {
      const dashes = screen.getAllByText('—')
      expect(dashes.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('handles null or missing submission details cleanly', async () => {
    const mockResult = {
      title: 'Exam U',
      results: [
        { problem_id: 50, title: 'Problem 50', submission_status: 'AC' },
      ],
    }
    mockedApi.get.mockImplementation((url) => {
      if (url === '/api/v1/submissions/latest') {
        return Promise.resolve({ data: null })
      }
      return Promise.resolve({ data: mockResult })
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Problem 50')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '展開明細' }))

    await waitFor(() => {
      expect(screen.getByText('此次提交尚無 testcase 明細。')).toBeInTheDocument()
    })
  })
})
