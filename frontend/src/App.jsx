import { Routes, Route, Navigate } from 'react-router-dom'

import { AuthProvider } from '@/contexts/AuthContext'
import ProtectedRoute from '@/components/ProtectedRoute'

import CandidateLayout from './layouts/CandidateLayout'
import StaffLayout from './layouts/StaffLayout'
import NotFoundPage from './pages/NotFoundPage'
import LoginPage from './pages/LoginPage'
import UnauthorizedPage from './pages/UnauthorizedPage'
import ExamListPage from './pages/candidate/ExamListPage'
import QuestionerStubPage from './pages/stubs/QuestionerStubPage'
import { ProblemListPage } from './pages/questioner'
import InterviewerStubPage from './pages/stubs/InterviewerStubPage'
import AdminStubPage from './pages/stubs/AdminStubPage'
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
          {/* P2 implements the create / edit form — stub for now */}
          <Route path="problems/new" element={<QuestionerStubPage />} />
          <Route path="problems/:id/edit" element={<QuestionerStubPage />} />
          {/* P3 implements the submissions view — stub for now */}
          <Route path="problems/:id/submissions" element={<QuestionerStubPage />} />
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
          <Route index element={<InterviewerStubPage />} />
          <Route path="*" element={<InterviewerStubPage />} />
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
          <Route index element={<AdminStubPage />} />
          <Route path="*" element={<AdminStubPage />} />
        </Route>

        {/* 404 catch-all */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AuthProvider>
  )
}
