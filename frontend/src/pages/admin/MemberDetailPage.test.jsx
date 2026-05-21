/**
 * Tests for MemberDetailPage (P3).
 *
 * 覆蓋場景：
 * (a) page loads and displays username as read-only after GET /api/v1/users/{id}
 * (b) edit submit → PATCH body is {full_name, role} — no username key
 * (c) password < 8 chars → "密碼至少需要 8 個字元", PUT not called
 * (d) valid password → PUT /api/v1/users/{id}/password-reset called with {new_password}
 * (e) 404 on load → error message shown
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

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
  Button: ({ children, onClick, disabled, asChild, type, variant }) => {
    if (asChild) return <span>{children}</span>
    return (
      <button onClick={onClick} disabled={disabled} type={type ?? 'button'}>
        {children}
      </button>
    )
  },
}))

// --- mock LoadingSpinner ---
vi.mock('@/components/LoadingSpinner', () => ({
  default: () => <div data-testid="loading-spinner" />,
}))

// --- mock ErrorMessage ---
vi.mock('@/components/ErrorMessage', () => ({
  default: ({ message }) => (
    <div data-testid="error-message">{message}</div>
  ),
}))

import api from '@/lib/api'
import MemberDetailPage from './MemberDetailPage'

const MOCK_MEMBER = {
  id: 'user-uuid-001',
  username: 'alice123',
  full_name: '愛麗絲',
  role: 'Candidate',
  created_at: '2026-01-01T00:00:00Z',
}

// Render the page at /admin/members/:id so useParams() can read the id
function renderPage(id = 'user-uuid-001') {
  return render(
    <MemoryRouter initialEntries={[`/admin/members/${id}`]}>
      <Routes>
        <Route path="/admin/members/:id" element={<MemberDetailPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('MemberDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // (a) page loads and displays username as read-only after GET /api/v1/users/{id}
  it('loads and displays the member username in a read-only field', async () => {
    api.get.mockResolvedValue({ data: MOCK_MEMBER })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('alice123')).toBeInTheDocument()
    })

    // username appears under the read-only section (帳號（不可更改）label)
    expect(screen.getByText('帳號（不可更改）')).toBeInTheDocument()
    expect(screen.getByText('alice123')).toBeInTheDocument()

    // full_name displayed in read-only section
    expect(screen.getByText('愛麗絲')).toBeInTheDocument()

    // password is always masked — not fetched from API
    expect(screen.getByText('••••••••')).toBeInTheDocument()

    // called the correct endpoint with the member id
    expect(api.get).toHaveBeenCalledWith('/api/v1/users/user-uuid-001')
  })

  // (b) edit submit → PATCH body is {full_name, role} — no username key
  it('sends PATCH with only {full_name, role} — no username in body', async () => {
    api.get.mockResolvedValue({ data: MOCK_MEMBER })
    api.patch.mockResolvedValue({
      data: { ...MOCK_MEMBER, full_name: '新姓名', role: 'Interviewer' },
    })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('alice123')).toBeInTheDocument()
    })

    // Change full_name in the edit form
    const fullNameInput = screen.getByLabelText('姓名')
    fireEvent.change(fullNameInput, { target: { value: '新姓名' } })

    // Change role in the edit form
    const roleSelect = screen.getByLabelText('角色')
    fireEvent.change(roleSelect, { target: { value: 'Interviewer' } })

    // Submit the edit form
    const form = screen.getByRole('button', { name: '儲存變更' }).closest('form')
    fireEvent.submit(form)

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/api/v1/users/user-uuid-001', {
        full_name: '新姓名',
        role: 'Interviewer',
      })
    })

    // Verify username is NOT present in the PATCH call
    const patchCall = api.patch.mock.calls[0][1]
    expect(patchCall).not.toHaveProperty('username')

    // Success message shown
    await waitFor(() => {
      expect(screen.getByText('使用者資訊已更新')).toBeInTheDocument()
    })
  })

  // (c) password < 8 chars → inline error, PUT not called
  it('shows "密碼至少需要 8 個字元" for < 8 char password and does not call PUT', async () => {
    api.get.mockResolvedValue({ data: MOCK_MEMBER })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('alice123')).toBeInTheDocument()
    })

    const pwInput = screen.getByLabelText('新密碼')
    fireEvent.change(pwInput, { target: { value: '1234567' } }) // 7 chars

    const pwForm = screen.getByRole('button', { name: '重設密碼' }).closest('form')
    fireEvent.submit(pwForm)

    await waitFor(() => {
      expect(screen.getByText('密碼至少需要 8 個字元')).toBeInTheDocument()
    })

    expect(api.put).not.toHaveBeenCalled()
  })

  // (d) valid password → PUT /api/v1/users/{id}/password-reset called with {new_password}
  it('calls PUT /api/v1/users/{id}/password-reset with {new_password} on valid input', async () => {
    api.get.mockResolvedValue({ data: MOCK_MEMBER })
    api.put.mockResolvedValue({ data: { detail: '密碼已重設' } })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('alice123')).toBeInTheDocument()
    })

    const pwInput = screen.getByLabelText('新密碼')
    fireEvent.change(pwInput, { target: { value: 'newpass123' } }) // 10 chars ≥ 8

    const pwForm = screen.getByRole('button', { name: '重設密碼' }).closest('form')
    fireEvent.submit(pwForm)

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/api/v1/users/user-uuid-001/password-reset', {
        new_password: 'newpass123',
      })
    })

    // Success message shown
    await waitFor(() => {
      expect(screen.getByText('密碼已重設')).toBeInTheDocument()
    })
  })

  // (e) 404 on load → error message shown
  it('shows an error message when the GET returns 404', async () => {
    api.get.mockRejectedValue({
      response: { status: 404, data: { detail: '找不到該使用者' } },
    })
    renderPage()

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeInTheDocument()
    })

    expect(screen.getByTestId('error-message')).toHaveTextContent('找不到該使用者')
  })
})
