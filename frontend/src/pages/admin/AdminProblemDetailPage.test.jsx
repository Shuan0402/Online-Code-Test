/**
 * Tests for AdminProblemDetailPage.
 */

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

// --- mock @/components/MarkdownView ---
vi.mock('@/components/MarkdownView', () => ({
  default: ({ children }) => <div data-testid="markdown-view">{children}</div>,
}))

// --- mock shadcn Dialog to render inline (avoid Radix portal issues in jsdom) ---
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children, onOpenChange }) => (
    open ? (
      <div data-testid="dialog">
        {children}
        <button data-testid="dialog-close-btn" onClick={() => onOpenChange(false)}>Close Dialog</button>
      </div>
    ) : null
  ),
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
  default: ({ message }) => <div data-testid="error-message">{message}</div>,
}))

// Mock navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

import api from '@/lib/api'
import AdminProblemDetailPage from './AdminProblemDetailPage'

const PROBLEM_ID = '42'
const MOCK_PROBLEM = {
  id: 42,
  title: '兩數相加',
  difficulty: 'Medium',
  time_limit_ms: 1000,
  memory_limit_mb: 256,
  creator_id: 'creator-uuid-xyz',
  created_at: '2026-06-10T16:30:00Z',
  description: '# 題目描述\n請計算 A + B。',
  test_cases: [
    { input_data: '1 2', expected_output: '3', score_weight: 50, is_sample: true },
    { input_data: '10 20', expected_output: '30', score_weight: 50, is_sample: false },
  ],
}

function renderPage(id = PROBLEM_ID) {
  return render(
    <MemoryRouter initialEntries={[`/admin/problems/${id}`]}>
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

  it('shows loading spinner first and then displays problem details correctly', async () => {
    api.get.mockResolvedValue({ data: MOCK_PROBLEM })

    renderPage()

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('題目詳情')).toBeInTheDocument()
    })

    expect(screen.getByText('兩數相加')).toBeInTheDocument()
    expect(screen.getByText('中等')).toBeInTheDocument()
    expect(screen.getByText('1000 ms')).toBeInTheDocument()
    expect(screen.getByText('256 MB')).toBeInTheDocument()
    expect(screen.getByText('creator-uuid-xyz')).toBeInTheDocument()
    expect(screen.getByTestId('markdown-view')).toHaveTextContent('請計算 A + B。')

    // Test cases table
    expect(screen.getByText('1 2')).toBeInTheDocument()
    expect(screen.getByText('10 20')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
    expect(screen.getAllByText('50').length).toBe(2)
    expect(screen.getByText('是')).toBeInTheDocument()
    expect(screen.getByText('否')).toBeInTheDocument()

    expect(api.get).toHaveBeenCalledWith(`/api/v1/problems/${PROBLEM_ID}`)
  })

  it('renders null / missing fields fallbacks gracefully', async () => {
    const mockProblemNulls = {
      id: 42,
      title: '空題目',
      difficulty: 'Easy',
      time_limit_ms: null,
      memory_limit_mb: null,
      creator_id: null,
      created_at: null,
      description: null,
      test_cases: [],
    }

    api.get.mockResolvedValue({ data: mockProblemNulls })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('題目詳情')).toBeInTheDocument()
    })

    expect(screen.getByText('空題目')).toBeInTheDocument()
    expect(screen.getByText('簡單')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4)
    expect(screen.getByText('（無描述）')).toBeInTheDocument()
    expect(screen.getByText('此題目沒有測試案例')).toBeInTheDocument()
  })

  it('handles load error and displays error message', async () => {
    api.get.mockRejectedValue({
      response: { data: { detail: '讀取題目錯誤' } },
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeInTheDocument()
    })

    expect(screen.getByTestId('error-message')).toHaveTextContent('讀取題目錯誤')
  })

  it('handles load error with default message when detail is missing', async () => {
    api.get.mockRejectedValue(new Error('Network error'))

    renderPage()

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeInTheDocument()
    })

    expect(screen.getByTestId('error-message')).toHaveTextContent('載入題目資料失敗，請稍後再試')
  })

  it('opens delete confirmation dialog and triggers API delete on confirm', async () => {
    api.get.mockResolvedValue({ data: MOCK_PROBLEM })
    api.delete.mockResolvedValue({ status: 204 })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('兩數相加')).toBeInTheDocument()
    })

    // Click Delete button to open dialog
    fireEvent.click(screen.getByRole('button', { name: '刪除題目' }))
    expect(screen.getByTestId('dialog')).toBeInTheDocument()
    expect(screen.getByText('確定要刪除題目「兩數相加」嗎？此操作無法復原。')).toBeInTheDocument()

    // Cancel deletion
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument()

    // Reopen and confirm
    fireEvent.click(screen.getByRole('button', { name: '刪除題目' }))
    fireEvent.click(screen.getByRole('button', { name: '確認刪除' }))

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith(`/api/v1/problems/${PROBLEM_ID}`)
      expect(mockNavigate).toHaveBeenCalledWith('/admin/problems')
    })
  })

  it('closes delete dialog and clears error when dialog is closed externally', async () => {
    api.get.mockResolvedValue({ data: MOCK_PROBLEM })
    api.delete.mockRejectedValue({
      response: { data: { detail: '無法刪除' } },
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('兩數相加')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '刪除題目' }))
    fireEvent.click(screen.getByRole('button', { name: '確認刪除' }))

    await waitFor(() => {
      expect(screen.getByText('無法刪除')).toBeInTheDocument()
    })

    // Close Dialog using Dialog's external close trigger
    fireEvent.click(screen.getByTestId('dialog-close-btn'))
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument()

    // Reopen and check that previous deleteError is cleared
    fireEvent.click(screen.getByRole('button', { name: '刪除題目' }))
    expect(screen.queryByText('無法刪除')).not.toBeInTheDocument()
  })

  it('shows delete error inside the dialog when delete fails and keeps detail content', async () => {
    api.get.mockResolvedValue({ data: MOCK_PROBLEM })
    api.delete.mockRejectedValue({
      response: { data: { detail: '刪除失敗，有其他考試正在使用此題目' } },
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('兩數相加')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '刪除題目' }))
    fireEvent.click(screen.getByRole('button', { name: '確認刪除' }))

    await waitFor(() => {
      expect(screen.getByText('刪除失敗，有其他考試正在使用此題目')).toBeInTheDocument()
    })

    // Dialog stays and page content stays
    expect(screen.getByTestId('dialog')).toBeInTheDocument()
    expect(screen.getByText('兩數相加')).toBeInTheDocument()
  })

  it('shows default delete error when detail is missing', async () => {
    api.get.mockResolvedValue({ data: MOCK_PROBLEM })
    api.delete.mockRejectedValue(new Error('Delete error'))

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('兩數相加')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '刪除題目' }))
    fireEvent.click(screen.getByRole('button', { name: '確認刪除' }))

    await waitFor(() => {
      expect(screen.getByText('刪除失敗，請稍後再試')).toBeInTheDocument()
    })
  })

  it('renders unknown difficulty values fallback styles and text', async () => {
    const mockProblemUnknownDiff = {
      id: 42,
      title: '神祕題目',
      difficulty: 'SuperHard',
      time_limit_ms: 500,
      memory_limit_mb: 128,
      creator_id: 'creator-uuid',
      created_at: null,
      description: 'desc',
      test_cases: [],
    }

    api.get.mockResolvedValue({ data: mockProblemUnknownDiff })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('神祕題目')).toBeInTheDocument()
    })

    expect(screen.getByText('SuperHard')).toBeInTheDocument()
  })
})
