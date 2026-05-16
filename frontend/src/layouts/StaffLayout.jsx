import { Outlet, NavLink } from 'react-router-dom'

// Sidebar + header shell for Questioner / Interviewer / Admin roles.
function SidebarLink({ to, label }) {
  return (
    <NavLink
      to={to}
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

export default function StaffLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-white px-6 py-3 flex items-center shadow-sm">
        <span className="text-lg font-semibold text-primary">線上程式測驗 — 管理後台</span>
      </header>
      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-56 border-r bg-white p-4 space-y-1 shrink-0">
          <SidebarLink to="/questioner" label="出題管理" />
          <SidebarLink to="/interviewer" label="面試管理" />
          <SidebarLink to="/admin" label="系統管理" />
        </aside>
        {/* Main content */}
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
