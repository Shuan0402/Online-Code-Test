import { render, screen, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'
import api from '@/lib/api'
import React from 'react'

vi.mock('@/lib/api', () => {
  return {
    default: {
      get: vi.fn(),
      post: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      }
    }
  }
})

// A test component that consumes useAuth
function AuthConsumer() {
  const { user, token, loading, login, logout } = useAuth()
  if (loading) return <div data-testid="loading">Loading...</div>
  return (
    <div>
      <div data-testid="user">{user ? user.username : 'no-user'}</div>
      <div data-testid="token">{token ? 'has-token' : 'no-token'}</div>
      <button onClick={() => login('mock-token', { username: 'test-user' })} data-testid="login-btn">Login</button>
      <button onClick={logout} data-testid="logout-btn">Logout</button>
    </div>
  )
}

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    // Mock window.location
    vi.stubGlobal('location', { href: '', pathname: '/' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('initializes with no token and no user', async () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    )

    await waitFor(() => expect(screen.queryByTestId('loading')).toBeNull())

    expect(screen.getByTestId('user').textContent).toBe('no-user')
    expect(screen.getByTestId('token').textContent).toBe('no-token')
  })

  it('rehydrates user if token exists in localStorage', async () => {
    localStorage.setItem('access_token', 'valid-token')
    api.get.mockResolvedValueOnce({ data: { username: 'rehydrated-user' } })

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    )

    await waitFor(() => expect(screen.queryByTestId('loading')).toBeNull())
    expect(screen.getByTestId('user').textContent).toBe('rehydrated-user')
    expect(screen.getByTestId('token').textContent).toBe('has-token')
    expect(api.get).toHaveBeenCalledWith('/api/v1/users/me')
  })

  it('clears credentials if rehydration returns 401', async () => {
    localStorage.setItem('access_token', 'expired-token')
    localStorage.setItem('user', JSON.stringify({ username: 'old' }))
    const err = new Error('Unauthorized')
    err.response = { status: 401 }
    api.get.mockRejectedValueOnce(err)

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    )

    await waitFor(() => expect(screen.queryByTestId('loading')).toBeNull())
    expect(screen.getByTestId('user').textContent).toBe('no-user')
    expect(screen.getByTestId('token').textContent).toBe('no-token')
    expect(localStorage.getItem('access_token')).toBeNull()
  })

  it('keeps cached user on 404 user/me (fallback)', async () => {
    localStorage.setItem('access_token', 'valid-token')
    localStorage.setItem('user', JSON.stringify({ username: 'cached-user' }))
    const err = new Error('Not found')
    err.response = { status: 404 }
    api.get.mockRejectedValueOnce(err)

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    )

    await waitFor(() => expect(screen.queryByTestId('loading')).toBeNull())
    expect(screen.getByTestId('user').textContent).toBe('cached-user')
    expect(screen.getByTestId('token').textContent).toBe('has-token')
  })

  it('performs login successfully', async () => {
    api.get.mockResolvedValueOnce({ data: { username: 'logged-in-user' } })

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    )

    await waitFor(() => expect(screen.queryByTestId('loading')).toBeNull())
    
    const loginBtn = screen.getByTestId('login-btn')
    await act(async () => {
      loginBtn.click()
    })

    expect(screen.getByTestId('user').textContent).toBe('logged-in-user')
    expect(screen.getByTestId('token').textContent).toBe('has-token')
    expect(localStorage.getItem('access_token')).toBe('mock-token')
  })

  it('performs logout successfully', async () => {
    localStorage.setItem('access_token', 'token-to-delete')
    localStorage.setItem('user', JSON.stringify({ username: 'user' }))
    api.get.mockResolvedValueOnce({ data: { username: 'user' } })
    api.post.mockResolvedValueOnce({})

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    )

    await waitFor(() => expect(screen.queryByTestId('loading')).toBeNull())

    const logoutBtn = screen.getByTestId('logout-btn')
    await act(async () => {
      logoutBtn.click()
    })

    expect(screen.getByTestId('user').textContent).toBe('no-user')
    expect(screen.getByTestId('token').textContent).toBe('no-token')
    expect(localStorage.getItem('access_token')).toBeNull()
  })
})
