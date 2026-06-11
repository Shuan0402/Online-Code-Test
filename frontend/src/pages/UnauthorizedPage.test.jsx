import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import UnauthorizedPage from './UnauthorizedPage'
import { useAuth } from '@/contexts/AuthContext'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)

describe('UnauthorizedPage', () => {
  it('renders the unauthorized message and layout', () => {
    mockedUseAuth.mockReturnValue({
      logout: vi.fn(),
    })

    render(
      <MemoryRouter>
        <UnauthorizedPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: '權限不足' })).toBeInTheDocument()
    expect(screen.getByText(/您沒有存取此頁面的權限。請確認您已使用正確的帳號登入。/)).toBeInTheDocument()
  })

  it('renders return to login link', () => {
    mockedUseAuth.mockReturnValue({
      logout: vi.fn(),
    })

    render(
      <MemoryRouter>
        <UnauthorizedPage />
      </MemoryRouter>
    )

    const loginLink = screen.getByRole('link', { name: '返回登入' })
    expect(loginLink).toBeInTheDocument()
    expect(loginLink.getAttribute('href')).toBe('/login')
  })

  it('calls logout function when logout button is clicked', () => {
    const logoutMock = vi.fn()
    mockedUseAuth.mockReturnValue({
      logout: logoutMock,
    })

    render(
      <MemoryRouter>
        <UnauthorizedPage />
      </MemoryRouter>
    )

    const logoutBtn = screen.getByRole('button', { name: '登出' })
    expect(logoutBtn).toBeInTheDocument()
    
    fireEvent.click(logoutBtn)
    expect(logoutMock).toHaveBeenCalledTimes(1)
  })
})
