import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

// Mock navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock useAuth
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

// Mock api
vi.mock('@/lib/api', () => ({
  default: {
    post: vi.fn(),
  },
}))

import { useAuth } from '@/contexts/AuthContext'
import api from '@/lib/api'
import LoginPage from './LoginPage'

const mockedUseAuth = vi.mocked(useAuth)
const mockedApi = vi.mocked(api)

function renderPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  )
}

describe('LoginPage', () => {
  const mockLogin = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({ login: mockLogin })
  })

  it('renders form fields correctly', () => {
    renderPage()
    expect(screen.getByLabelText('帳號')).toBeInTheDocument()
    expect(screen.getByLabelText('密碼')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '登入' })).toBeInTheDocument()
  })

  it('updates state when typing in fields', () => {
    renderPage()
    const usernameInput = screen.getByLabelText('帳號')
    const passwordInput = screen.getByLabelText('密碼')

    fireEvent.change(usernameInput, { target: { value: 'user123' } })
    fireEvent.change(passwordInput, { target: { value: 'pass123' } })

    expect(usernameInput.value).toBe('user123')
    expect(passwordInput.value).toBe('pass123')
  })

  it('submits correctly and navigates to candidate landing path', async () => {
    mockedApi.post.mockResolvedValue({
      data: { access_token: 'mock-access-token', role: 'candidate' },
    })
    mockLogin.mockResolvedValue({ role: 'candidate' })

    renderPage()

    fireEvent.change(screen.getByLabelText('帳號'), { target: { value: 'candidate_user' } })
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'pass123' } })
    fireEvent.click(screen.getByRole('button', { name: '登入' }))

    await waitFor(() => {
      expect(mockedApi.post).toHaveBeenCalledWith(
        '/api/v1/auth/login',
        expect.any(URLSearchParams),
        expect.any(Object)
      )
    })

    const body = mockedApi.post.mock.calls[0][1]
    expect(body.get('username')).toBe('candidate_user')
    expect(body.get('password')).toBe('pass123')

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('mock-access-token', {
        username: 'candidate_user',
        role: 'candidate',
      })
      expect(mockNavigate).toHaveBeenCalledWith('/candidate/exams', { replace: true })
    })
  })

  it('navigates to questioner path for questioner role', async () => {
    mockedApi.post.mockResolvedValue({
      data: { access_token: 'mock-token', role: 'questioner' },
    })
    mockLogin.mockResolvedValue({ role: 'questioner' })

    renderPage()

    fireEvent.change(screen.getByLabelText('帳號'), { target: { value: 'q_user' } })
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'pass' } })
    fireEvent.click(screen.getByRole('button', { name: '登入' }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/questioner', { replace: true })
    })
  })

  it('navigates to interviewer path for interviewer role', async () => {
    mockedApi.post.mockResolvedValue({
      data: { access_token: 'mock-token', role: 'interviewer' },
    })
    mockLogin.mockResolvedValue({ role: 'interviewer' })

    renderPage()

    fireEvent.change(screen.getByLabelText('帳號'), { target: { value: 'i_user' } })
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'pass' } })
    fireEvent.click(screen.getByRole('button', { name: '登入' }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/interviewer', { replace: true })
    })
  })

  it('navigates to admin path for admin role', async () => {
    mockedApi.post.mockResolvedValue({
      data: { access_token: 'mock-token', role: 'admin' },
    })
    mockLogin.mockResolvedValue({ role: 'admin' })

    renderPage()

    fireEvent.change(screen.getByLabelText('帳號'), { target: { value: 'a_user' } })
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'pass' } })
    fireEvent.click(screen.getByRole('button', { name: '登入' }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/admin', { replace: true })
    })
  })

  it('navigates to login path for unknown role', async () => {
    mockedApi.post.mockResolvedValue({
      data: { access_token: 'mock-token', role: 'unknown' },
    })
    mockLogin.mockResolvedValue({ role: 'unknown' })

    renderPage()

    fireEvent.change(screen.getByLabelText('帳號'), { target: { value: 'u_user' } })
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'pass' } })
    fireEvent.click(screen.getByRole('button', { name: '登入' }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
    })
  })

  it('navigates to login path when role is missing in res.data', async () => {
    mockedApi.post.mockResolvedValue({
      data: { access_token: 'mock-token' }, // role is missing
    })
    mockLogin.mockResolvedValue({ role: null })

    renderPage()

    fireEvent.change(screen.getByLabelText('帳號'), { target: { value: 'u_user' } })
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'pass' } })
    fireEvent.click(screen.getByRole('button', { name: '登入' }))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('mock-token', {
        username: 'u_user',
        role: null,
      })
      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
    })
  })


  it('shows error for 401 or 400 API response', async () => {
    mockedApi.post.mockRejectedValue({
      response: { status: 401 },
    })

    renderPage()

    fireEvent.change(screen.getByLabelText('帳號'), { target: { value: 'wrong_user' } })
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'wrong_pass' } })
    fireEvent.click(screen.getByRole('button', { name: '登入' }))

    await waitFor(() => {
      expect(screen.getByText('帳號或密碼錯誤，請重新確認。')).toBeInTheDocument()
    })
  })

  it('shows error for 422 API response', async () => {
    mockedApi.post.mockRejectedValue({
      response: { status: 422 },
    })

    renderPage()

    fireEvent.change(screen.getByLabelText('帳號'), { target: { value: 'user' } })
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'pass' } })
    fireEvent.click(screen.getByRole('button', { name: '登入' }))

    await waitFor(() => {
      expect(
        screen.getByText('登入請求格式錯誤（422），請聯絡系統管理員。')
      ).toBeInTheDocument()
    })
  })

  it('shows default status error for other HTTP status codes', async () => {
    mockedApi.post.mockRejectedValue({
      response: { status: 500 },
    })

    renderPage()

    fireEvent.change(screen.getByLabelText('帳號'), { target: { value: 'user' } })
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'pass' } })
    fireEvent.click(screen.getByRole('button', { name: '登入' }))

    await waitFor(() => {
      expect(screen.getByText('登入失敗（500），請稍後再試。')).toBeInTheDocument()
    })
  })

  it('shows connection error for network failure without status code', async () => {
    mockedApi.post.mockRejectedValue(new Error('Network Error'))

    renderPage()

    fireEvent.change(screen.getByLabelText('帳號'), { target: { value: 'user' } })
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'pass' } })
    fireEvent.click(screen.getByRole('button', { name: '登入' }))

    await waitFor(() => {
      expect(screen.getByText('無法連線至伺服器，請確認網路狀態。')).toBeInTheDocument()
    })
  })
})
