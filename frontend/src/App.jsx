import { Routes, Route, Navigate } from 'react-router-dom'

import { AuthProvider } from '@/contexts/AuthContext'
import ProtectedRoute from '@/components/ProtectedRoute'

import CandidateLayout from './layouts/CandidateLayout'
import StaffLayout from './layouts/StaffLayout'
import NotFoundPage from './pages/NotFoundPage'
import LoginPage from './pages/LoginPage'
import UnauthorizedPage from './pages/UnauthorizedPage'
import ExamListPage from './pages/candidate/ExamListPage'
import {
  ProblemListPage,
  ProblemFormPage,
  ProblemSubmissionsPage,
} from './pages/questioner'
import {
  ExamListPage as InterviewerExamListPage,
  ExamFormPage,
  ExamDetailPage,
  ExamResultPage,
  CandidateListPage,
  CandidateFormPage,
  CandidateDetailPage,
  SubmissionDetailPage,
  ProfilePage,
} from './pages/interviewer'
import {
  DashboardPage,
  MemberListPage,
  MemberCreatePage,
  MemberDetailPage,
  AdminExamListPage,
  AdminExamDetailPage,
  AdminProblemListPage,
  AdminProblemDetailPage,
} from '@/pages/admin'
import TakeExamPage from './pages/candidate/TakeExamPage'
import ResultPage from './pages/candidate/ResultPage'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />

        {/* Redirect root to candidate exams as a sensible default */}
        <Route path="/" element={<Navigate to="/candidate/exams" replace />} />

        {/* Candidate panel — top-header-only layout */}
        <Route
          path="/candidate"
          element={
            <ProtectedRoute allowedRoles={['candidate']}>
              <CandidateLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/candidate/exams" replace />} />
          <Route path="exams" element={<ExamListPage />} />
          <Route path="exams/:id/take" element={<TakeExamPage />} />
          <Route path="exams/:id/result" element={<ResultPage />} />
        </Route>

        {/* Questioner panel */}
        <Route
          path="/questioner"
          element={
            <ProtectedRoute allowedRoles={['questioner', 'admin']}>
              <StaffLayout />
            </ProtectedRoute>
          }
        >
          {/* index and /questioner/problems both render the list page */}
          <Route index element={<ProblemListPage />} />
          <Route path="problems" element={<ProblemListPage />} />
          {/* P2 — create and edit form */}
          <Route path="problems/new" element={<ProblemFormPage />} />
          <Route path="problems/:id/edit" element={<ProblemFormPage />} />
          {/* P3 — submissions view for a specific problem */}
          <Route
            path="problems/:id/submissions"
            element={<ProblemSubmissionsPage />}
          />
        </Route>

        {/* Interviewer panel */}
        <Route
          path="/interviewer"
          element={
            <ProtectedRoute allowedRoles={['interviewer', 'admin']}>
              <StaffLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<InterviewerExamListPage />} />
          <Route path="exams/new" element={<ExamFormPage />} />
          <Route path="exams/:id" element={<ExamDetailPage />} />
          <Route path="exams/:id/result" element={<ExamResultPage />} />
          <Route
            path="exams/:examId/problems/:problemId"
            element={<SubmissionDetailPage />}
          />
          <Route path="candidates" element={<CandidateListPage />} />
          <Route path="candidates/new" element={<CandidateFormPage />} />
          <Route path="candidates/:id" element={<CandidateDetailPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        {/* Admin panel */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <StaffLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="members" element={<MemberListPage />} />
          <Route path="members/new" element={<MemberCreatePage />} />
          <Route path="members/:id" element={<MemberDetailPage />} />
          <Route path="exams" element={<AdminExamListPage />} />
          <Route path="exams/:id" element={<AdminExamDetailPage />} />
          <Route path="problems" element={<AdminProblemListPage />} />
          <Route path="problems/:id" element={<AdminProblemDetailPage />} />
        </Route>

        {/* 404 catch-all */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AuthProvider>
  )
}
