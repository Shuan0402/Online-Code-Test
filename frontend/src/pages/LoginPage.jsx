import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import api from '@/lib/api'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

/**
 * Role → default landing path mapping.
 * The backend user.role field is expected to be one of:
 *   "candidate", "questioner", "interviewer", "admin"
 */
const ROLE_HOME = {
  candidate: '/candidate/exams',
  questioner: '/questioner',
  interviewer: '/interviewer',
  admin: '/admin',
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // CRITICAL: backend uses OAuth2PasswordRequestForm which requires
    // application/x-www-form-urlencoded, NOT JSON.
    // Using URLSearchParams produces the correct body encoding.
    const body = new URLSearchParams()
    body.append('username', username)
    body.append('password', password)

    try {
      const res = await api.post('/api/v1/auth/login', body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })

      const accessToken = res.data.access_token

      // Attempt to fetch /users/me; pass a minimal fallback user in case
      // the endpoint is not yet available on the backend.
      const fallbackUser = { username, role: res.data.role ?? null }
      const userData = await login(accessToken, fallbackUser)

      // Redirect by role; fall back to /login if role is unknown.
      const role = userData?.role?.toLowerCase()
      const destination = ROLE_HOME[role] ?? '/login'
      navigate(destination, { replace: true })
    } catch (err) {
      if (err.response) {
        const status = err.response.status
        if (status === 401 || status === 400) {
          setError('帳號或密碼錯誤，請重新確認。')
        } else if (status === 422) {
          // 422 almost always means the body encoding is wrong (not form-urlencoded).
          setError('登入請求格式錯誤（422），請聯絡系統管理員。')
          console.error('[LoginPage] 422 Unprocessable Entity — check Content-Type header and body encoding.')
        } else {
          setError(`登入失敗（${status}），請稍後再試。`)
        }
      } else {
        setError('無法連線至伺服器，請確認網路狀態。')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm shadow-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">線上程式測驗</CardTitle>
          <CardDescription className="text-center">請輸入帳號與密碼登入</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">帳號</Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密碼</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '登入中...' : '登入'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
