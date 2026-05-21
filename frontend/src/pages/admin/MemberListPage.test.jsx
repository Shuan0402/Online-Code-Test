/**
 * Tests for MemberListPage (P2).
 *
 * 覆蓋場景：
 * (a) all 4 roles rendered from mixed response
 * (b) role filter "Admin" → only Admin rows visible; "全部" → all rows
 * (c) delete button disabled for the row matching useAuth().user.id (delete-self guard)
 *     delete button enabled for other rows
 * (d) delete confirm → DELETE /api/v1/users/{id} called (200), row removed from state
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

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

// --- mock @/contexts/AuthContext (delete-self guard) ---
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: { id: 'admin-uuid' } })),
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
  Button: ({ children, onClick, disabled, asChild, variant, size }) => {
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
import MemberListPage from './MemberListPage'

// Mixed-role mock data — all 4 roles present
const MOCK_MEMBERS = [
  {
    id: 'admin-uuid',
    username: 'admin_user',
    full_name: '管理員',
    role: 'Admin',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'candidate-uuid',
    username: 'candidate_user',
    full_name: '考生甲',
    role: 'Candidate',
    created_at: '2026-01-02T00:00:00Z',
  },
  {
    id: 'interviewer-uuid',
    username: 'interviewer_user',
    full_name: '面試官',
    role: 'Interviewer',
    created_at: '2026-01-03T00:00:00Z',
  },
  {
    id: 'questioner-uuid',
    username: 'questioner_user',
    full_name: null,
    role: 'Questioner',
    created_at: '2026-01-04T00:00:00Z',
  },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <MemberListPage />
    </MemoryRouter>
  )
}

describe('MemberListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: MOCK_MEMBERS })
  })

  // (a) all 4 roles rendered from mixed response
  it('renders members of all 4 roles from the API response', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('admin_user')).toBeInTheDocument()
    })

    expect(screen.getByText('candidate_user')).toBeInTheDocument()
    expect(screen.getByText('interviewer_user')).toBeInTheDocument()
    // questioner_user has null full_name so it appears in both 姓名 and 帳號 columns
    expect(screen.getAllByText('questioner_user').length).toBeGreaterThanOrEqual(1)

    // all 4 role values visible in the table (role column in the filter dropdown + table)
    // use getAllByText since "Admin" can appear in both the filter <option> and the table cell
    expect(screen.getAllByText('Admin').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Candidate').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Interviewer').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Questioner').length).toBeGreaterThanOrEqual(1)

    // fetches from the correct endpoint
    expect(api.get).toHaveBeenCalledWith('/api/v1/users/')
  })

  // (b) role filter "Admin" → only Admin rows; "全部" → all rows (no extra fetch)
  it('role filter "Admin" shows only Admin rows', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('admin_user')).toBeInTheDocument()
    })

    // There are two comboboxes: role-filter select + a hidden one in the dialog if open
    // Use the role-filter select by its id/label
    const select = screen.getByRole('combobox', { name: /角色篩選/ })
    fireEvent.change(select, { target: { value: 'Admin' } })

    expect(screen.getByText('admin_user')).toBeInTheDocument()
    expect(screen.queryByText('candidate_user')).not.toBeInTheDocument()
    expect(screen.queryByText('interviewer_user')).not.toBeInTheDocument()
    expect(screen.queryByText('questioner_user')).not.toBeInTheDocument()
  })

  it('role filter "全部" (empty value) restores all rows without a new API call', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('candidate_user')).toBeInTheDocument()
    })

    const select = screen.getByRole('combobox', { name: /角色篩選/ })
    fireEvent.change(select, { target: { value: 'Candidate' } })
    expect(screen.queryByText('admin_user')).not.toBeInTheDocument()

    fireEvent.change(select, { target: { value: '' } })
    expect(screen.getByText('admin_user')).toBeInTheDocument()
    expect(screen.getByText('candidate_user')).toBeInTheDocument()

    // only the initial GET call — no re-fetch on filter change
    expect(api.get).toHaveBeenCalledTimes(1)
  })

  // (c) delete button disabled for current user's own row; enabled for others
  it('disables the delete button for the current admin own row', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('admin_user')).toBeInTheDocument()
    })

    // All delete buttons
    const deleteButtons = screen.getAllByRole('button', { name: '刪除' })
    // There are 4 members; find the one for admin-uuid (first row, 管理員 / admin_user)
    // The disabled one should be the admin's own row
    const disabledButtons = deleteButtons.filter((btn) => btn.disabled)
    const enabledButtons = deleteButtons.filter((btn) => !btn.disabled)

    expect(disabledButtons).toHaveLength(1)
    expect(enabledButtons).toHaveLength(3)
  })

  // (d) delete confirm → DELETE /api/v1/users/{id} called, row removed from state
  it('confirming delete calls DELETE /api/v1/users/{id} and removes the row', async () => {
    api.delete.mockResolvedValue({ status: 200, data: { detail: '刪除成功' } })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('candidate_user')).toBeInTheDocument()
    })

    // Click the delete button for the candidate (second row, not self)
    const deleteButtons = screen.getAllByRole('button', { name: '刪除' })
    const enabledDeleteBtn = deleteButtons.find((btn) => !btn.disabled)
    fireEvent.click(enabledDeleteBtn)

    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '確認刪除' }))

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/api/v1/users/candidate-uuid')
    })

    await waitFor(() => {
      expect(screen.queryByText('candidate_user')).not.toBeInTheDocument()
    })
  })

  // (d) delete error → inline error shown, row stays
  it('delete error shows inline error message and keeps the row in the DOM', async () => {
    api.delete.mockRejectedValue({
      response: { data: { detail: '無法刪除此成員' } },
    })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('candidate_user')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByRole('button', { name: '刪除' })
    const enabledDeleteBtn = deleteButtons.find((btn) => !btn.disabled)
    fireEvent.click(enabledDeleteBtn)

    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '確認刪除' }))

    await waitFor(() => {
      expect(screen.getByText('無法刪除此成員')).toBeInTheDocument()
    })

    // row stays
    expect(screen.getByText('candidate_user')).toBeInTheDocument()
  })
})
