import { Outlet, Link } from 'react-router-dom'

// Top-header-only layout for Candidate role.
// No sidebar — keeps full width for the exam editor.
export default function CandidateLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-white px-6 py-3 flex items-center justify-between shadow-sm">
        <Link to="/candidate/exams" className="text-lg font-semibold text-primary">
          線上程式測驗
        </Link>
        <span className="text-sm text-muted-foreground">考生</span>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
