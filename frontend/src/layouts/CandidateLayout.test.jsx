/**
 * Tests for CandidateLayout.
 *
 * 覆蓋場景：
 * (a) header renders username when user.username exists
 * (b) falls back to email when username is missing
 * (c) falls back to default label when no user object
 * (d) logout button calls logout() and Outlet content is rendered
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '@/contexts/AuthContext'
import CandidateLayout from './CandidateLayout'

const mockedUseAuth = vi.mocked(useAuth)

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/candidate']}>
      <Routes>
        <Route path="/candidate" element={<CandidateLayout />}>
          <Route index element={<div>Outlet Content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('CandidateLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the app title link and shows username from auth', async () => {
    const logoutMock = vi.fn()
    mockedUseAuth.mockReturnValue({ user: { username: 'candidate01' }, logout: logoutMock })

    renderLayout()

    expect(screen.getByRole('link', { name: '線上程式測驗' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '線上程式測驗' }).getAttribute('href')).toBe('/candidate/exams')
    expect(screen.getByText('candidate01')).toBeInTheDocument()
    expect(screen.getByText('Outlet Content')).toBeInTheDocument()
  })

  it('renders email when username is absent', () => {
    const logoutMock = vi.fn()
    mockedUseAuth.mockReturnValue({ user: { email: 'user@example.com' }, logout: logoutMock })

    renderLayout()

    expect(screen.getByText('user@example.com')).toBeInTheDocument()
  })

  it('renders default label when no user is available', () => {
    const logoutMock = vi.fn()
    mockedUseAuth.mockReturnValue({ user: null, logout: logoutMock })

    renderLayout()

    expect(screen.getByText('考生')).toBeInTheDocument()
  })

  it('calls logout when 登出 button is clicked', async () => {
    const logoutMock = vi.fn()
    mockedUseAuth.mockReturnValue({ user: { username: 'candidate01' }, logout: logoutMock })

    renderLayout()

    fireEvent.click(screen.getByRole('button', { name: '登出' }))

    await waitFor(() => {
      expect(logoutMock).toHaveBeenCalledTimes(1)
    })
  })
})