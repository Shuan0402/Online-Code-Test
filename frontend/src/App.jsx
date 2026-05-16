import { Routes, Route, Navigate } from 'react-router-dom'

import CandidateLayout from './layouts/CandidateLayout'
import StaffLayout from './layouts/StaffLayout'
import NotFoundPage from './pages/NotFoundPage'
import QuestionerStubPage from './pages/stubs/QuestionerStubPage'
import InterviewerStubPage from './pages/stubs/InterviewerStubPage'
import AdminStubPage from './pages/stubs/AdminStubPage'

// Temporary stub for candidate pages — P3/P4/P5 will replace these.
function CandidateStub() {
  return (
    <div className="p-8 text-muted-foreground text-center text-lg">
      功能開發中
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      {/* Redirect root to candidate exams as a sensible default */}
      <Route path="/" element={<Navigate to="/candidate/exams" replace />} />

      {/* Candidate panel — top-header-only layout */}
      <Route path="/candidate" element={<CandidateLayout />}>
        <Route index element={<Navigate to="/candidate/exams" replace />} />
        <Route path="exams" element={<CandidateStub />} />
        <Route path="exams/:id/take" element={<CandidateStub />} />
        <Route path="exams/:id/result" element={<CandidateStub />} />
      </Route>

      {/* Staff panels — sidebar + header layout */}
      <Route path="/questioner" element={<StaffLayout />}>
        <Route index element={<QuestionerStubPage />} />
        <Route path="*" element={<QuestionerStubPage />} />
      </Route>

      <Route path="/interviewer" element={<StaffLayout />}>
        <Route index element={<InterviewerStubPage />} />
        <Route path="*" element={<InterviewerStubPage />} />
      </Route>

      <Route path="/admin" element={<StaffLayout />}>
        <Route index element={<AdminStubPage />} />
        <Route path="*" element={<AdminStubPage />} />
      </Route>

      {/* 404 catch-all */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
