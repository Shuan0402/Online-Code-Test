/**
 * Tests for ProfilePage (P8).
 *
 * 覆蓋場景：
 * (a) profile form pre-fills from GET /users/me response
 * (b) save → PATCH /api/v1/users/me called with { full_name } only — no username, no role
 * (c) password < 8 → "新密碼至少需要 8 個字元", PUT not called
 * (d) password mismatch → "新密碼與確認密碼不一致", PUT not called
 * (e) password success → PUT /api/v1/users/me/password called with { old_password, new_password },
 *     "密碼已更新" shown, fields cleared
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

// --- mock LoadingSpinner ---
vi.mock('@/components/LoadingSpinner', () => ({
  default: () => <div data-testid="loading-spinner" />,
}))

// --- mock ErrorMessage ---
vi.mock('@/components/ErrorMessage', () => ({
  default: ({ message }) => <div data-testid="error-message">{message}</div>,
}))

import api from '@/lib/api'
import ProfilePage from './ProfilePage'

const MOCK_USER = {
  id: 'user-uuid-1234',
  username: 'interviewer01',
  full_name: '張面試官',
  role: 'Interviewer',
  created_at: '2026-01-01T00:00:00Z',
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ProfilePage />
    </MemoryRouter>
  )
}

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // (a) profile form pre-fills from GET /users/me
  it('pre-fills full_name and shows read-only username from GET /api/v1/users/me', async () => {
    api.get.mockResolvedValue({ data: MOCK_USER })
    renderPage()

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/v1/users/me')
    })

    // username shown read-only
    await waitFor(() => {
      expect(screen.getByText('interviewer01')).toBeInTheDocument()
    })

    // full_name pre-filled in the input
    const fullNameInput = screen.getByLabelText('姓名')
    expect(fullNameInput.value).toBe('張面試官')
  })

  // (b) save → PATCH /api/v1/users/me called with { full_name } ONLY
  // This test fails if role or username is accidentally included in the PATCH body
  it('calls PATCH /api/v1/users/me with { full_name } only — no username, no role', async () => {
    api.get.mockResolvedValue({ data: MOCK_USER })
    api.patch.mockResolvedValue({
      data: { ...MOCK_USER, full_name: '新姓名' },
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('interviewer01')).toBeInTheDocument()
    })

    // Edit full_name
    const fullNameInput = screen.getByLabelText('姓名')
    fireEvent.change(fullNameInput, { target: { value: '新姓名' } })

    // Click save
    fireEvent.click(screen.getByRole('button', { name: '儲存變更' }))

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/api/v1/users/me', { full_name: '新姓名' })
    })

    // PATCH body must NOT include username or role
    const patchBody = api.patch.mock.calls[0][1]
    expect(patchBody).not.toHaveProperty('username')
    expect(patchBody).not.toHaveProperty('role')

    // Success message shown
    await waitFor(() => {
      expect(screen.getByText('個人資料已更新')).toBeInTheDocument()
    })
  })

  // (c) new password < 8 → "新密碼至少需要 8 個字元", PUT not called
  // This test fails if the `newPassword.length < 8` guard is removed
  it('shows "新密碼至少需要 8 個字元" and does not call PUT when new password is too short', async () => {
    api.get.mockResolvedValue({ data: MOCK_USER })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('interviewer01')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('目前密碼'), { target: { value: 'oldpass' } })
    fireEvent.change(screen.getByLabelText('新密碼'), { target: { value: 'short' } })
    fireEvent.change(screen.getByLabelText('確認新密碼'), { target: { value: 'short' } })

    fireEvent.click(screen.getByRole('button', { name: '更新密碼' }))

    await waitFor(() => {
      expect(screen.getByText('新密碼至少需要 8 個字元')).toBeInTheDocument()
    })
    expect(api.put).not.toHaveBeenCalled()
  })

  // (d) password mismatch → "新密碼與確認密碼不一致", PUT not called
  // This test fails if the `newPassword !== confirmPassword` guard is removed
  it('shows "新密碼與確認密碼不一致" and does not call PUT when passwords do not match', async () => {
    api.get.mockResolvedValue({ data: MOCK_USER })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('interviewer01')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('目前密碼'), { target: { value: 'oldpassword' } })
    fireEvent.change(screen.getByLabelText('新密碼'), { target: { value: 'newpassword1' } })
    fireEvent.change(screen.getByLabelText('確認新密碼'), { target: { value: 'newpassword2' } })

    fireEvent.click(screen.getByRole('button', { name: '更新密碼' }))

    await waitFor(() => {
      expect(screen.getByText('新密碼與確認密碼不一致')).toBeInTheDocument()
    })
    expect(api.put).not.toHaveBeenCalled()
  })

  // (e) password success → PUT called with { old_password, new_password }, "密碼已更新" shown, fields cleared
  it('calls PUT /api/v1/users/me/password with { old_password, new_password } and shows "密碼已更新"', async () => {
    api.get.mockResolvedValue({ data: MOCK_USER })
    api.put.mockResolvedValue({})

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('interviewer01')).toBeInTheDocument()
    })

    const oldPwInput = screen.getByLabelText('目前密碼')
    const newPwInput = screen.getByLabelText('新密碼')
    const confirmPwInput = screen.getByLabelText('確認新密碼')

    fireEvent.change(oldPwInput, { target: { value: 'oldpassword' } })
    fireEvent.change(newPwInput, { target: { value: 'newpassword1' } })
    fireEvent.change(confirmPwInput, { target: { value: 'newpassword1' } })

    fireEvent.click(screen.getByRole('button', { name: '更新密碼' }))

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/api/v1/users/me/password', {
        old_password: 'oldpassword',
        new_password: 'newpassword1',
      })
    })

    await waitFor(() => {
      expect(screen.getByText('密碼已更新')).toBeInTheDocument()
    })

    // Password fields should be cleared after success
    expect(oldPwInput.value).toBe('')
    expect(newPwInput.value).toBe('')
    expect(confirmPwInput.value).toBe('')
  })
})
