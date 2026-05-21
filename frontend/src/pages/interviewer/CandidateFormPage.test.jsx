/**
 * Tests for CandidateFormPage (P5).
 *
 * 覆蓋場景：
 * (a) empty username → "請填寫帳號", POST not called
 * (b) username 2 chars → "帳號至少需要 3 個字元", POST not called
 * (c) password 7 chars → "密碼至少需要 8 個字元", POST not called
 * (d) success → POST /api/v1/users/ called with exact body { username, password, role: 'Candidate' }
 * (e) optional full_name omitted → body has full_name: null
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
  Button: ({ children, onClick, disabled, asChild, type, variant }) => {
    if (asChild) return <span>{children}</span>
    return <button onClick={onClick} disabled={disabled} type={type ?? 'button'}>{children}</button>
  },
}))

import api from '@/lib/api'
import CandidateFormPage from './CandidateFormPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <CandidateFormPage />
    </MemoryRouter>
  )
}

describe('CandidateFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // (a) empty username → "請填寫帳號", POST not called
  it('shows "請填寫帳號" and does not call POST when username is empty', async () => {
    renderPage()

    // Fill password but leave username empty; use fireEvent.submit on the <form>
    // to bypass jsdom's HTML5 constraint-validation which blocks click on required inputs
    const passwordInput = screen.getByLabelText(/密碼/)
    fireEvent.change(passwordInput, { target: { value: 'password8' } })

    // Submit the form element directly (avoids jsdom required-field block on button click)
    const form = screen.getByRole('button', { name: '建立考生' }).closest('form')
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('請填寫帳號')).toBeInTheDocument()
    })
    expect(api.post).not.toHaveBeenCalled()
  })

  // (b) username 2 chars → "帳號至少需要 3 個字元"
  // This test fails if the `username.trim().length < 3` guard is removed
  it('shows "帳號至少需要 3 個字元" when username has fewer than 3 characters', async () => {
    renderPage()

    const usernameInput = screen.getByLabelText(/帳號/)
    fireEvent.change(usernameInput, { target: { value: 'ab' } })

    const passwordInput = screen.getByLabelText(/密碼/)
    fireEvent.change(passwordInput, { target: { value: 'password8' } })

    fireEvent.click(screen.getByRole('button', { name: '建立考生' }))

    await waitFor(() => {
      expect(screen.getByText('帳號至少需要 3 個字元')).toBeInTheDocument()
    })
    expect(api.post).not.toHaveBeenCalled()
  })

  // (c) password 7 chars → "密碼至少需要 8 個字元"
  // This test fails if the `password.length < 8` guard is removed
  it('shows "密碼至少需要 8 個字元" when password is fewer than 8 characters', async () => {
    renderPage()

    const usernameInput = screen.getByLabelText(/帳號/)
    fireEvent.change(usernameInput, { target: { value: 'alice123' } })

    const passwordInput = screen.getByLabelText(/密碼/)
    fireEvent.change(passwordInput, { target: { value: '1234567' } })

    fireEvent.click(screen.getByRole('button', { name: '建立考生' }))

    await waitFor(() => {
      expect(screen.getByText('密碼至少需要 8 個字元')).toBeInTheDocument()
    })
    expect(api.post).not.toHaveBeenCalled()
  })

  // (d) success → POST called with exact body
  it('calls POST /api/v1/users/ with exact body { username, password, role: "Candidate" } on success', async () => {
    api.post.mockResolvedValue({ data: { id: 'new-user-uuid-001' } })
    renderPage()

    const usernameInput = screen.getByLabelText(/帳號/)
    fireEvent.change(usernameInput, { target: { value: 'alice123' } })

    const passwordInput = screen.getByLabelText(/密碼/)
    fireEvent.change(passwordInput, { target: { value: 'password8' } })

    fireEvent.click(screen.getByRole('button', { name: '建立考生' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/v1/users/', {
        username: 'alice123',
        full_name: null,
        password: 'password8',
        role: 'Candidate',
      })
    })
  })

  // (e) optional full_name omitted → body has full_name: null
  it('sends full_name: null when full_name field is left empty', async () => {
    api.post.mockResolvedValue({ data: { id: 'new-user-uuid-002' } })
    renderPage()

    const usernameInput = screen.getByLabelText(/帳號/)
    fireEvent.change(usernameInput, { target: { value: 'bob456' } })

    const passwordInput = screen.getByLabelText(/密碼/)
    fireEvent.change(passwordInput, { target: { value: 'securepass' } })

    // full_name left blank (default '')
    fireEvent.click(screen.getByRole('button', { name: '建立考生' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalled()
    })

    const body = api.post.mock.calls[0][1]
    expect(body.full_name).toBeNull()
    expect(body.role).toBe('Candidate')
  })
})
