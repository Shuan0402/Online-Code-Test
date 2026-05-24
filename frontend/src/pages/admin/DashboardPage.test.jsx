/**
 * Tests for DashboardPage (P6).
 *
 * 覆蓋場景：
 * (a) exam count aggregation: 3 exams (2 Draft, 1 Ongoing) → total 3, Draft 2, Ongoing 1
 * (b) submission verdict breakdown: 5 submissions (3 AC, 2 WA) → AC 3, WA 2, total 5
 * (c) member role breakdown: 4 users (2 Admin, 1 Candidate, 1 Interviewer) → correct counts
 * (d) Grafana button visible and href correct when VITE_GRAFANA_URL is set
 * (e) Grafana button absent when VITE_GRAFANA_URL is empty
 */

import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

// --- mock @/lib/api ---
vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

// --- mock ui/card (render children inline) ---
vi.mock('@/components/ui/card', () => ({
  Card: ({ children }) => <div>{children}</div>,
  CardHeader: ({ children }) => <div>{children}</div>,
  CardTitle: ({ children }) => <div>{children}</div>,
  CardContent: ({ children }) => <div>{children}</div>,
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
import DashboardPage from './DashboardPage'

// Default mock data
const MOCK_EXAMS = [
  { id: 'e1', title: '考試一', status: 'Draft' },
  { id: 'e2', title: '考試二', status: 'Draft' },
  { id: 'e3', title: '考試三', status: 'Ongoing' },
]

const MOCK_SUBMISSIONS = [
  { id: 's1', status: 'AC' },
  { id: 's2', status: 'AC' },
  { id: 's3', status: 'AC' },
  { id: 's4', status: 'WA' },
  { id: 's5', status: 'WA' },
]

const MOCK_USERS = [
  { id: 'u1', username: 'admin1', role: 'Admin' },
  { id: 'u2', username: 'admin2', role: 'Admin' },
  { id: 'u3', username: 'cand1', role: 'Candidate' },
  { id: 'u4', username: 'inter1', role: 'Interviewer' },
]

function setupApiMocks(exams = MOCK_EXAMS, submissions = MOCK_SUBMISSIONS, users = MOCK_USERS) {
  api.get.mockImplementation((url) => {
    if (url === '/api/v1/exams/') return Promise.resolve({ data: exams })
    if (url === '/api/v1/submissions/') return Promise.resolve({ data: submissions })
    if (url === '/api/v1/users/') return Promise.resolve({ data: users })
    return Promise.reject(new Error(`unexpected url: ${url}`))
  })
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupApiMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  // (a) exam count aggregation
  it('shows correct exam total and status breakdown', async () => {
    // Use only exams to isolate exam counts, with empty submissions/users
    api.get.mockImplementation((url) => {
      if (url === '/api/v1/exams/') return Promise.resolve({ data: MOCK_EXAMS })
      if (url === '/api/v1/submissions/') return Promise.resolve({ data: [] })
      if (url === '/api/v1/users/') return Promise.resolve({ data: [] })
      return Promise.reject(new Error(`unexpected url: ${url}`))
    })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('考試總數：3')).toBeInTheDocument()
    })

    // Draft = 2, Ongoing = 1 — verify totals are present
    expect(screen.getByText('考試總數：3')).toBeInTheDocument()
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1)

    // Verify "Draft" and "Ongoing" labels exist in the exam card
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.getByText('Ongoing')).toBeInTheDocument()
  })

  // (b) submission verdict breakdown
  it('shows correct submission total and verdict breakdown (AC/WA)', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('提交總數：5')).toBeInTheDocument()
    })

    // AC = 3, WA = 2
    const cells = screen.getAllByText(/^\d+$/)
    const numbers = cells.map((el) => el.textContent)
    expect(numbers).toContain('3')
    expect(numbers).toContain('2')

    // Verify verdict labels
    expect(screen.getByText('AC')).toBeInTheDocument()
    expect(screen.getByText('WA')).toBeInTheDocument()
  })

  // (c) member role breakdown
  it('shows correct member total and role breakdown', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('成員總數：4')).toBeInTheDocument()
    })

    // Admin = 2, Candidate = 1, Interviewer = 1, Questioner = 0
    const cells = screen.getAllByText(/^\d+$/)
    const numbers = cells.map((el) => el.textContent)
    expect(numbers).toContain('2')
    expect(numbers).toContain('1')

    // Role labels
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getByText('Candidate')).toBeInTheDocument()
    expect(screen.getByText('Interviewer')).toBeInTheDocument()
    expect(screen.getByText('Questioner')).toBeInTheDocument()
  })

  // (d) Grafana button visible when env var is set
  it('renders Grafana link button with correct href when VITE_GRAFANA_URL is set', async () => {
    vi.stubEnv('VITE_GRAFANA_URL', 'http://grafana:3000')
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('考試總數：3')).toBeInTheDocument()
    })

    const link = screen.getByRole('link', { name: /Grafana/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', 'http://grafana:3000')
    expect(link).toHaveAttribute('target', '_blank')
  })

  // (e) Grafana button absent when env var is empty
  it('does not render Grafana button when VITE_GRAFANA_URL is empty', async () => {
    vi.stubEnv('VITE_GRAFANA_URL', '')
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('考試總數：3')).toBeInTheDocument()
    })

    expect(screen.queryByRole('link', { name: /Grafana/i })).not.toBeInTheDocument()
  })
})
