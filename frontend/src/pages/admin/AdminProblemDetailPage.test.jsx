import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// --- mock @/lib/api ---
vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    delete: vi.fn(),
  },
}))

// --- mock shadcn Dialog to render inline (avoid Radix portal issues in jsdom) ---
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

import api from '@/lib/api'
import AdminProblemDetailPage from './AdminProblemDetailPage'

const MOCK_PROBLEM = {
  id: 1,
  title: '兩數相加',
  difficulty: 'Easy',
  time_limit_ms: 1000,
  memory_limit_mb: 256,
  creator_id: 'creator-uuid',
  created_at: '2026-06-10T00:00:00.000Z',
  description: '寫一個程式計算 $A + B$',
  test_cases: [
    { input_data: '1 2', expected_output: '3', score_weight: 50, is_sample: true },
    { input_data: '10 20', expected_output: '30', score_weight: 50, is_sample: false },
  ],
}

// Helper to mock navigation
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: '1' }),
  }
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/problems/1']}>
      <Routes>
        <Route path="/admin/problems/:id" element={<AdminProblemDetailPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('AdminProblemDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading spinner and then loads problem details', async () => {
    api.get.mockResolvedValue({ data: MOCK_PROBLEM })
    renderPage()

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('兩數相加')).toBeInTheDocument()
    })

    expect(screen.getByText('簡單')).toBeInTheDocument()
    expect(screen.getByText('1000 ms')).toBeInTheDocument()
    expect(screen.getByText('256 MB')).toBeInTheDocument()
    expect(screen.getByText('creator-uuid')).toBeInTheDocument()
    expect(screen.getByText('1 2')).toBeInTheDocument()
    expect(screen.getByText('10 20')).toBeInTheDocument()
  })

  it('renders error message if API fails to load data', async () => {
    api.get.mockRejectedValue({
      response: { data: { detail: '載入題目失敗！' } }
    })
    renderPage()

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeInTheDocument()
    })
    expect(screen.getByText('載入題目失敗！')).toBeInTheDocument()
  })

  it('handles delete flow successfully', async () => {
    api.get.mockResolvedValue({ data: MOCK_PROBLEM })
    api.delete.mockResolvedValue({ status: 204 })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('兩數相加')).toBeInTheDocument()
    })

    // Open delete dialog
    fireEvent.click(screen.getByText('刪除題目'))

    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument()
    })

    // Cancel deletion
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument()

    // Open again and confirm deletion
    fireEvent.click(screen.getByText('刪除題目'))
    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '確認刪除' }))

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/api/v1/problems/1')
    })
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/admin/problems')
    })
  })

  it('handles delete error flow', async () => {
    api.get.mockResolvedValue({ data: MOCK_PROBLEM })
    api.delete.mockRejectedValue({
      response: { data: { detail: '無法刪除此題目' } }
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('兩數相加')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('刪除題目'))
    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '確認刪除' }))

    await waitFor(() => {
      expect(screen.getByText('無法刪除此題目')).toBeInTheDocument()
    })
  })
})
