import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export default function UnauthorizedPage() {
  const { logout } = useAuth()

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
      <h1 className="text-3xl font-bold text-destructive">權限不足</h1>
      <p className="text-muted-foreground text-center max-w-sm">
        您沒有存取此頁面的權限。請確認您已使用正確的帳號登入。
      </p>
      <div className="flex gap-3 mt-2">
        <Link
          to="/login"
          className="inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          返回登入
        </Link>
        <button
          onClick={logout}
          className="inline-flex items-center px-4 py-2 rounded-md border border-input bg-background text-sm font-medium hover:bg-accent transition-colors"
        >
          登出
        </button>
      </div>
    </div>
  )
}
