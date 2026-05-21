import { Outlet, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

// Top-header-only layout for Candidate role.
// No sidebar — keeps full width for the exam editor.
export default function CandidateLayout() {
  const { user, logout } = useAuth()

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <header className="border-b bg-white px-6 py-3 flex items-center justify-between shadow-sm shrink-0">
        <Link
          to="/candidate/exams"
          className="text-lg font-semibold text-primary"
        >
          線上程式測驗
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {user?.username ?? user?.email ?? '考生'}
          </span>
          <button
            onClick={logout}
            className="text-sm px-3 py-1.5 rounded-md border border-input hover:bg-accent transition-colors"
          >
            登出
          </button>
        </div>
      </header>
      <main className="flex-1 flex flex-col min-h-0">
        <Outlet />
      </main>
    </div>
  )
}
