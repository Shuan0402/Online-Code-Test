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
import InterviewerStubPage from './pages/stubs/InterviewerStubPage'
import AdminStubPage from './pages/stubs/AdminStubPage'
import TakeExamPage from './pages/candidate/TakeExamPage'

// Temporary stub for P5 result page (implemented in P5).
function CandidateStub() {
  return (
    <div className="p-8 text-muted-foreground text-center text-lg">
      功能開發中
    </div>
  )
}

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
          <Route path="exams/:id/result" element={<CandidateStub />} />
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
          <Route index element={<QuestionerStubPage />} />
          <Route path="*" element={<QuestionerStubPage />} />
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
