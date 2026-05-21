/**
 * Tests for MemberCreatePage (P2).
 *
 * 覆蓋場景：
 * (a) empty username → "請填寫帳號", POST not called
 * (b) username 2 chars → "帳號至少需要 3 個字元", POST not called
 * (c) password 7 chars → "密碼至少需要 8 個字元", POST not called
 * (d) success → POST body has {username, full_name: null, password, role: 'Candidate'} for default role
 * (e) 400 "該帳號名稱已存在" → inline error message shown
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

// --- mock ui/button ---
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, asChild, type }) => {
    if (asChild) return <span>{children}</span>
    return (
      <button onClick={onClick} disabled={disabled} type={type ?? 'button'}>
        {children}
      </button>
    )
  },
}))

import api from '@/lib/api'
import MemberCreatePage from './MemberCreatePage'

function renderPage() {
  return render(
    <MemoryRouter>
      <MemberCreatePage />
    </MemoryRouter>,
  )
}

describe('MemberCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // (a) empty username → "請填寫帳號", POST not called
  it('shows "請填寫帳號" and does not call POST when username is empty', async () => {
    renderPage()

    // Fill password but leave username empty
    const passwordInput = screen.getByLabelText(/密碼/)
    fireEvent.change(passwordInput, { target: { value: 'password8' } })

    // Submit the form directly (avoids jsdom HTML5 required-field block)
    const form = screen
      .getByRole('button', { name: '建立成員' })
      .closest('form')
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('請填寫帳號')).toBeInTheDocument()
    })
    expect(api.post).not.toHaveBeenCalled()
  })

  // (b) username 2 chars → "帳號至少需要 3 個字元", POST not called
  it('shows "帳號至少需要 3 個字元" when username has fewer than 3 characters', async () => {
    renderPage()

    const usernameInput = screen.getByLabelText(/帳號/)
    fireEvent.change(usernameInput, { target: { value: 'ab' } })

    const passwordInput = screen.getByLabelText(/密碼/)
    fireEvent.change(passwordInput, { target: { value: 'password8' } })

    fireEvent.click(screen.getByRole('button', { name: '建立成員' }))

    await waitFor(() => {
      expect(screen.getByText('帳號至少需要 3 個字元')).toBeInTheDocument()
    })
    expect(api.post).not.toHaveBeenCalled()
  })

  // (c) password 7 chars → "密碼至少需要 8 個字元", POST not called
  it('shows "密碼至少需要 8 個字元" when password is fewer than 8 characters', async () => {
    renderPage()

    const usernameInput = screen.getByLabelText(/帳號/)
    fireEvent.change(usernameInput, { target: { value: 'alice123' } })

    const passwordInput = screen.getByLabelText(/密碼/)
    fireEvent.change(passwordInput, { target: { value: '1234567' } })

    fireEvent.click(screen.getByRole('button', { name: '建立成員' }))

    await waitFor(() => {
      expect(screen.getByText('密碼至少需要 8 個字元')).toBeInTheDocument()
    })
    expect(api.post).not.toHaveBeenCalled()
  })

  // (d) success → POST body has {username, full_name: null, password, role: 'Candidate'} for default role
  it('calls POST /api/v1/users/ with correct body including role "Candidate" and full_name null', async () => {
    api.post.mockResolvedValue({ data: { id: 'new-member-uuid-001' } })
    renderPage()

    const usernameInput = screen.getByLabelText(/帳號/)
    fireEvent.change(usernameInput, { target: { value: 'alice123' } })

    const passwordInput = screen.getByLabelText(/密碼/)
    fireEvent.change(passwordInput, { target: { value: 'password8' } })

    // full_name left blank — role defaults to Candidate
    fireEvent.click(screen.getByRole('button', { name: '建立成員' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/v1/users/', {
        username: 'alice123',
        full_name: null,
        password: 'password8',
        role: 'Candidate',
      })
    })
  })

  // (e) 400 "該帳號名稱已存在" → inline error message shown
  it('shows "該帳號名稱已存在" when the backend returns 400 with that detail', async () => {
    api.post.mockRejectedValue({
      response: { data: { detail: '該帳號名稱已存在' } },
    })
    renderPage()

    const usernameInput = screen.getByLabelText(/帳號/)
    fireEvent.change(usernameInput, { target: { value: 'existing_user' } })

    const passwordInput = screen.getByLabelText(/密碼/)
    fireEvent.change(passwordInput, { target: { value: 'password8' } })

    fireEvent.click(screen.getByRole('button', { name: '建立成員' }))

    await waitFor(() => {
      expect(screen.getByText('該帳號名稱已存在')).toBeInTheDocument()
    })
  })
})
