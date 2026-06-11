/**
 * Tests for App.jsx (routing and layout configuration).
 */

import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { MemoryRouter, Outlet } from 'react-router-dom'

// --- Mock layouts & context ---
vi.mock('./layouts/CandidateLayout', () => ({
  default: () => <div data-testid="candidate-layout"><Outlet /></div>,
}))

vi.mock('./layouts/StaffLayout', () => ({
  default: () => <div data-testid="staff-layout"><Outlet /></div>,
}))

vi.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }) => <div data-testid="auth-provider">{children}</div>,
}))

vi.mock('@/components/ProtectedRoute', () => ({
  default: ({ children, allowedRoles }) => (
    <div data-testid={`protected-${allowedRoles.join('-')}`}>
      {children}
    </div>
  ),
}))

// --- Mock public pages ---
vi.mock('./pages/LoginPage', () => ({
  default: () => <div data-testid="login-page" />,
}))

vi.mock('./pages/UnauthorizedPage', () => ({
  default: () => <div data-testid="unauthorized-page" />,
}))

vi.mock('./pages/NotFoundPage', () => ({
  default: () => <div data-testid="not-found-page" />,
}))

// --- Mock candidate pages ---
vi.mock('./pages/candidate/ExamListPage', () => ({
  default: () => <div data-testid="candidate-exam-list-page" />,
}))

vi.mock('./pages/candidate/TakeExamPage', () => ({
  default: () => <div data-testid="take-exam-page" />,
}))

vi.mock('./pages/candidate/ResultPage', () => ({
  default: () => <div data-testid="result-page" />,
}))

// --- Mock questioner pages ---
vi.mock('./pages/questioner', () => ({
  ProblemListPage: () => <div data-testid="problem-list-page" />,
  ProblemFormPage: () => <div data-testid="problem-form-page" />,
  ProblemSubmissionsPage: () => <div data-testid="problem-submissions-page" />,
}))

// --- Mock interviewer pages ---
vi.mock('./pages/interviewer', () => ({
  ExamListPage: () => <div data-testid="interviewer-exam-list-page" />,
  ExamFormPage: () => <div data-testid="exam-form-page" />,
  BatchExamFormPage: () => <div data-testid="batch-exam-form-page" />,
  ExamDetailPage: () => <div data-testid="exam-detail-page" />,
  ExamResultPage: () => <div data-testid="exam-result-page" />,
  CandidateListPage: () => <div data-testid="candidate-list-page" />,
  CandidateFormPage: () => <div data-testid="candidate-form-page" />,
  CandidateDetailPage: () => <div data-testid="candidate-detail-page" />,
  SubmissionDetailPage: () => <div data-testid="submission-detail-page" />,
  ProfilePage: () => <div data-testid="profile-page" />,
}))

// --- Mock admin pages ---
vi.mock('@/pages/admin', () => ({
  DashboardPage: () => <div data-testid="dashboard-page" />,
  MemberListPage: () => <div data-testid="member-list-page" />,
  MemberCreatePage: () => <div data-testid="member-create-page" />,
  MemberDetailPage: () => <div data-testid="member-detail-page" />,
  AdminExamListPage: () => <div data-testid="admin-exam-list-page" />,
  AdminExamDetailPage: () => <div data-testid="admin-exam-detail-page" />,
  AdminProblemListPage: () => <div data-testid="admin-problem-list-page" />,
  AdminProblemDetailPage: () => <div data-testid="admin-problem-detail-page" />,
}))

import App from './App'

function renderApp(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>
  )
}

describe('App Routing', () => {
  it('renders LoginPage for /login', () => {
    renderApp('/login')
    expect(screen.getByTestId('auth-provider')).toBeInTheDocument()
    expect(screen.getByTestId('login-page')).toBeInTheDocument()
  })

  it('renders UnauthorizedPage for /unauthorized', () => {
    renderApp('/unauthorized')
    expect(screen.getByTestId('unauthorized-page')).toBeInTheDocument()
  })

  it('redirects root / to candidate exams', () => {
    renderApp('/')
    expect(screen.getByTestId('protected-candidate')).toBeInTheDocument()
    expect(screen.getByTestId('candidate-layout')).toBeInTheDocument()
    expect(screen.getByTestId('candidate-exam-list-page')).toBeInTheDocument()
  })

  it('renders candidate take exam page', () => {
    renderApp('/candidate/exams/123/take')
    expect(screen.getByTestId('protected-candidate')).toBeInTheDocument()
    expect(screen.getByTestId('candidate-layout')).toBeInTheDocument()
    expect(screen.getByTestId('take-exam-page')).toBeInTheDocument()
  })

  it('renders candidate result page', () => {
    renderApp('/candidate/exams/123/result')
    expect(screen.getByTestId('protected-candidate')).toBeInTheDocument()
    expect(screen.getByTestId('candidate-layout')).toBeInTheDocument()
    expect(screen.getByTestId('result-page')).toBeInTheDocument()
  })

  it('renders questioner problem list page', () => {
    renderApp('/questioner/problems')
    expect(screen.getByTestId('protected-questioner-admin')).toBeInTheDocument()
    expect(screen.getByTestId('staff-layout')).toBeInTheDocument()
    expect(screen.getByTestId('problem-list-page')).toBeInTheDocument()
  })

  it('renders questioner problem create/edit page', () => {
    renderApp('/questioner/problems/new')
    expect(screen.getByTestId('protected-questioner-admin')).toBeInTheDocument()
    expect(screen.getByTestId('problem-form-page')).toBeInTheDocument()
  })

  it('renders questioner problem submissions page', () => {
    renderApp('/questioner/problems/456/submissions')
    expect(screen.getByTestId('protected-questioner-admin')).toBeInTheDocument()
    expect(screen.getByTestId('problem-submissions-page')).toBeInTheDocument()
  })

  it('renders interviewer exam list page', () => {
    renderApp('/interviewer')
    expect(screen.getByTestId('protected-interviewer-admin')).toBeInTheDocument()
    expect(screen.getByTestId('staff-layout')).toBeInTheDocument()
    expect(screen.getByTestId('interviewer-exam-list-page')).toBeInTheDocument()
  })

  it('renders interviewer exam creation form', () => {
    renderApp('/interviewer/exams/new')
    expect(screen.getByTestId('protected-interviewer-admin')).toBeInTheDocument()
    expect(screen.getByTestId('exam-form-page')).toBeInTheDocument()
  })

  it('renders interviewer exam detail page', () => {
    renderApp('/interviewer/exams/789')
    expect(screen.getByTestId('protected-interviewer-admin')).toBeInTheDocument()
    expect(screen.getByTestId('exam-detail-page')).toBeInTheDocument()
  })

  it('renders interviewer exam result page', () => {
    renderApp('/interviewer/exams/789/result')
    expect(screen.getByTestId('protected-interviewer-admin')).toBeInTheDocument()
    expect(screen.getByTestId('exam-result-page')).toBeInTheDocument()
  })

  it('renders interviewer submission detail page', () => {
    renderApp('/interviewer/exams/789/problems/123')
    expect(screen.getByTestId('protected-interviewer-admin')).toBeInTheDocument()
    expect(screen.getByTestId('submission-detail-page')).toBeInTheDocument()
  })

  it('renders interviewer candidate management list', () => {
    renderApp('/interviewer/candidates')
    expect(screen.getByTestId('protected-interviewer-admin')).toBeInTheDocument()
    expect(screen.getByTestId('candidate-list-page')).toBeInTheDocument()
  })

  it('renders interviewer candidate creation form', () => {
    renderApp('/interviewer/candidates/new')
    expect(screen.getByTestId('protected-interviewer-admin')).toBeInTheDocument()
    expect(screen.getByTestId('candidate-form-page')).toBeInTheDocument()
  })

  it('renders interviewer candidate detail page', () => {
    renderApp('/interviewer/candidates/abc')
    expect(screen.getByTestId('protected-interviewer-admin')).toBeInTheDocument()
    expect(screen.getByTestId('candidate-detail-page')).toBeInTheDocument()
  })

  it('renders interviewer profile page', () => {
    renderApp('/interviewer/profile')
    expect(screen.getByTestId('protected-interviewer-admin')).toBeInTheDocument()
    expect(screen.getByTestId('profile-page')).toBeInTheDocument()
  })

  it('renders admin dashboard page', () => {
    renderApp('/admin')
    expect(screen.getByTestId('protected-admin')).toBeInTheDocument()
    expect(screen.getByTestId('staff-layout')).toBeInTheDocument()
    expect(screen.getByTestId('dashboard-page')).toBeInTheDocument()
  })

  it('renders admin member list page', () => {
    renderApp('/admin/members')
    expect(screen.getByTestId('protected-admin')).toBeInTheDocument()
    expect(screen.getByTestId('member-list-page')).toBeInTheDocument()
  })

  it('renders admin member create page', () => {
    renderApp('/admin/members/new')
    expect(screen.getByTestId('protected-admin')).toBeInTheDocument()
    expect(screen.getByTestId('member-create-page')).toBeInTheDocument()
  })

  it('renders admin member detail page', () => {
    renderApp('/admin/members/member-id')
    expect(screen.getByTestId('protected-admin')).toBeInTheDocument()
    expect(screen.getByTestId('member-detail-page')).toBeInTheDocument()
  })

  it('renders admin exam list page', () => {
    renderApp('/admin/exams')
    expect(screen.getByTestId('protected-admin')).toBeInTheDocument()
    expect(screen.getByTestId('admin-exam-list-page')).toBeInTheDocument()
  })

  it('renders admin exam detail page', () => {
    renderApp('/admin/exams/exam-id')
    expect(screen.getByTestId('protected-admin')).toBeInTheDocument()
    expect(screen.getByTestId('admin-exam-detail-page')).toBeInTheDocument()
  })

  it('renders admin problem list page', () => {
    renderApp('/admin/problems')
    expect(screen.getByTestId('protected-admin')).toBeInTheDocument()
    expect(screen.getByTestId('admin-problem-list-page')).toBeInTheDocument()
  })

  it('renders admin problem detail page', () => {
    renderApp('/admin/problems/problem-id')
    expect(screen.getByTestId('protected-admin')).toBeInTheDocument()
    expect(screen.getByTestId('admin-problem-detail-page')).toBeInTheDocument()
  })

  it('renders NotFoundPage for invalid paths', () => {
    renderApp('/invalid-page-xyz')
    expect(screen.getByTestId('not-found-page')).toBeInTheDocument()
  })
})
