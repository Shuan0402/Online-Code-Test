import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import StaffLayout from './StaffLayout'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)

function renderLayout(initialPath = '/admin') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<StaffLayout />}>
          <Route path="admin" element={<div>Admin Dashboard</div>} />
          <Route path="admin/members" element={<div>Members Management</div>} />
          <Route path="interviewer" element={<div>Interviewer Dashboard</div>} />
          <Route path="questioner" element={<div>Questioner Dashboard</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('StaffLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders admin links when user role is admin', () => {
    mockedUseAuth.mockReturnValue({
      user: { username: 'admin01', role: 'admin' },
      logout: vi.fn(),
    })

    renderLayout('/admin')

    expect(screen.getByText('線上程式測驗 — 管理後台')).toBeInTheDocument()
    expect(screen.getByText('admin01')).toBeInTheDocument()
    expect(screen.getByText('Admin Dashboard')).toBeInTheDocument()

    // Admin links
    expect(screen.getByRole('link', { name: '儀表板' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '成員管理' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '考試管理' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '題目管理' })).toBeInTheDocument()

    // Non-admin link should not be present
    expect(screen.queryByRole('link', { name: '出題管理' })).not.toBeInTheDocument()

    // Verify NavLink active state
    const dashboardLink = screen.getByRole('link', { name: '儀表板' })
    const membersLink = screen.getByRole('link', { name: '成員管理' })
    expect(dashboardLink.className).toContain('bg-primary text-primary-foreground')
    expect(membersLink.className).toContain('text-muted-foreground')
  })

  it('renders interviewer links when user role is interviewer', () => {
    mockedUseAuth.mockReturnValue({
      user: { email: 'interviewer@example.com', role: 'interviewer' },
      logout: vi.fn(),
    })

    renderLayout('/interviewer')

    expect(screen.getByText('interviewer@example.com')).toBeInTheDocument()
    expect(screen.getByText('Interviewer Dashboard')).toBeInTheDocument()

    // Interviewer links
    expect(screen.getByRole('link', { name: '面試管理' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '考生管理' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '個人資料' })).toBeInTheDocument()

    // Non-interviewer links
    expect(screen.queryByRole('link', { name: '成員管理' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '出題管理' })).not.toBeInTheDocument()
  })

  it('renders questioner links when user role is questioner', () => {
    mockedUseAuth.mockReturnValue({
      user: { username: 'q01', role: 'questioner' },
      logout: vi.fn(),
    })

    renderLayout('/questioner')

    expect(screen.getByText('Questioner Dashboard')).toBeInTheDocument()

    // Questioner link
    expect(screen.getByRole('link', { name: '出題管理' })).toBeInTheDocument()

    // Non-questioner links
    expect(screen.queryByRole('link', { name: '面試管理' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '成員管理' })).not.toBeInTheDocument()
  })

  it('renders all links when user role is unknown or missing', () => {
    mockedUseAuth.mockReturnValue({
      user: { username: 'unknown_user', role: 'unknown' },
      logout: vi.fn(),
    })

    renderLayout('/admin')

    // All links fall back
    expect(screen.getByRole('link', { name: '出題管理' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '面試管理' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '考生管理' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '個人資料' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '儀表板' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '成員管理' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '考試管理' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '題目管理' })).toBeInTheDocument()
  })

  it('renders default user details layout when user object exists but lacks username/email', () => {
    mockedUseAuth.mockReturnValue({
      user: { role: 'admin' },
      logout: vi.fn(),
    })

    renderLayout('/admin')

    expect(screen.getByText('線上程式測驗 — 管理後台')).toBeInTheDocument()
    // It should render empty string for name next to logout button but header structure should exist
    const logoutBtn = screen.getByRole('button', { name: '登出' })
    expect(logoutBtn).toBeInTheDocument()
  })

  it('calls logout function when clicking logout button', async () => {
    const logoutMock = vi.fn()
    mockedUseAuth.mockReturnValue({
      user: { username: 'admin01', role: 'admin' },
      logout: logoutMock,
    })

    renderLayout('/admin')

    const logoutBtn = screen.getByRole('button', { name: '登出' })
    fireEvent.click(logoutBtn)

    await waitFor(() => {
      expect(logoutMock).toHaveBeenCalledTimes(1)
    })
  })
})
