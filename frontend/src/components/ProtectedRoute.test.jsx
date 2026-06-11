import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'
import { useAuth } from '@/contexts/AuthContext'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)

function renderProtected(allowedRoles = null) {
  return render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route
          path="/protected"
          element={
            <ProtectedRoute allowedRoles={allowedRoles}>
              <div data-testid="protected-content">Protected Content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div data-testid="login-content">Login Page</div>} />
        <Route path="/unauthorized" element={<div data-testid="unauthorized-content">Unauthorized Page</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ProtectedRoute', () => {
  it('renders nothing while loading', () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      token: null,
      loading: true,
    })
    const { container } = renderProtected()
    expect(container.firstChild).toBeNull()
  })

  it('redirects to /login if token is missing', () => {
    mockedUseAuth.mockReturnValue({
      user: { role: 'candidate' },
      token: null,
      loading: false,
    })
    renderProtected()
    expect(screen.getByTestId('login-content')).toBeInTheDocument()
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })

  it('redirects to /login if user is missing', () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      token: 'some-token',
      loading: false,
    })
    renderProtected()
    expect(screen.getByTestId('login-content')).toBeInTheDocument()
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })

  it('redirects to /unauthorized if user role is not allowed', () => {
    mockedUseAuth.mockReturnValue({
      user: { role: 'candidate' },
      token: 'some-token',
      loading: false,
    })
    renderProtected(['admin', 'interviewer'])
    expect(screen.getByTestId('unauthorized-content')).toBeInTheDocument()
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })

  it('renders children if user role matches one of allowedRoles case-insensitively', () => {
    mockedUseAuth.mockReturnValue({
      user: { role: 'InTeRvIeWeR' },
      token: 'some-token',
      loading: false,
    })
    renderProtected(['Admin', 'interviewer'])
    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    expect(screen.queryByTestId('unauthorized-content')).not.toBeInTheDocument()
  })

  it('renders children if allowedRoles is not specified', () => {
    mockedUseAuth.mockReturnValue({
      user: { role: 'candidate' },
      token: 'some-token',
      loading: false,
    })
    renderProtected()
    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
  })
})
