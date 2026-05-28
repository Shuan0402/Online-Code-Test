import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

// Sidebar + header shell for Questioner / Interviewer / Admin roles.
// end=true is passed for exact-match links (e.g. 儀表板 /admin) so they are not
// highlighted when the user navigates to sub-routes like /admin/members.
function SidebarLink({ to, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `block px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          isActive
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        }`
      }
    >
      {label}
    </NavLink>
  )
}

// Nav links visible per role.
const NAV_BY_ROLE = {
  questioner: [{ to: '/questioner', label: '出題管理' }],
  interviewer: [
    { to: '/interviewer', label: '面試管理', end: true },
    { to: '/interviewer/candidates', label: '考生管理' },
    { to: '/interviewer/profile', label: '個人資料' },
  ],
  admin: [
    { to: '/admin', label: '儀表板', end: true },
    { to: '/admin/members', label: '成員管理' },
    { to: '/admin/exams', label: '考試管理' },
    { to: '/admin/problems', label: '題目管理' },
  ],
}

export default function StaffLayout() {
  const { user, logout } = useAuth()

  const role = user?.role?.toLowerCase()
  // Fall back to showing all links if role is somehow unknown (shouldn't happen with ProtectedRoute).
  const navLinks = NAV_BY_ROLE[role] ?? [
    { to: '/questioner', label: '出題管理' },
    { to: '/interviewer', label: '面試管理' },
    { to: '/interviewer/candidates', label: '考生管理' },
    { to: '/interviewer/profile', label: '個人資料' },
    { to: '/admin', label: '儀表板', end: true },
    { to: '/admin/members', label: '成員管理' },
    { to: '/admin/exams', label: '考試管理' },
    { to: '/admin/problems', label: '題目管理' },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-white px-6 py-3 flex items-center justify-between shadow-sm">
        <span className="text-lg font-semibold text-primary">線上程式測驗 — 管理後台</span>
        <div className="flex items-center gap-3">
          {user && (
            <span className="text-sm text-muted-foreground">{user.username ?? user.email ?? ''}</span>
          )}
          <button
            onClick={logout}
            className="text-sm px-3 py-1.5 rounded-md border border-input hover:bg-accent transition-colors"
          >
            登出
          </button>
        </div>
      </header>
      <div className="flex flex-1">
        {/* Sidebar — only shows links applicable to this user's role */}
        <aside className="w-56 border-r bg-white p-4 space-y-1 shrink-0">
          {navLinks.map((link) => (
            <SidebarLink key={link.to} to={link.to} label={link.label} end={link.end} />
          ))}
        </aside>
        {/* Main content */}
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
