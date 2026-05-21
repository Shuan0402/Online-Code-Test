import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'

import api from '@/lib/api'
import { Button } from '@/components/ui/button'

const ROLES = ['Admin', 'Candidate', 'Interviewer', 'Questioner']

export default function MemberCreatePage() {
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('Candidate')
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError(null)

    // 客戶端驗證
    if (!username.trim()) {
      setFormError('請填寫帳號')
      return
    }
    if (username.trim().length < 3) {
      setFormError('帳號至少需要 3 個字元')
      return
    }
    if (!password) {
      setFormError('請填寫密碼')
      return
    }
    if (password.length < 8) {
      setFormError('密碼至少需要 8 個字元')
      return
    }

    setSubmitting(true)
    try {
      const body = {
        username: username.trim(),
        full_name: fullName.trim() || null,
        password,
        role,
      }
      const res = await api.post('/api/v1/users/', body)
      // 201 → 導向新建成員的詳情頁
      navigate(`/admin/members/${res.data.id}`)
    } catch (err) {
      const detail = err.response?.data?.detail
      if (Array.isArray(detail)) {
        setFormError(detail.map((d) => d.msg).join('；'))
      } else {
        setFormError(detail ?? '建立成員帳號失敗，請稍後再試')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-6 max-w-lg space-y-6">
      {/* 頁首 */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link to="/admin/members">← 返回成員列表</Link>
        </Button>
        <h1 className="text-2xl font-semibold">新增成員</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 帳號（必填） */}
        <div className="space-y-1">
          <label htmlFor="username" className="text-sm font-medium">
            帳號 <span className="text-destructive">*</span>
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={50}
            placeholder="3–50 個字元"
            className="w-full rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* 姓名（選填） */}
        <div className="space-y-1">
          <label htmlFor="full-name" className="text-sm font-medium">
            姓名（選填）
          </label>
          <input
            id="full-name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={100}
            placeholder="真實姓名"
            className="w-full rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* 密碼（必填） */}
        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium">
            密碼 <span className="text-destructive">*</span>
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 8 個字元"
            className="w-full rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* 角色（必填） */}
        <div className="space-y-1">
          <label htmlFor="role" className="text-sm font-medium">
            角色 <span className="text-destructive">*</span>
          </label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {/* 表單錯誤訊息 */}
        {formError && (
          <p className="text-sm font-medium text-destructive">{formError}</p>
        )}

        {/* 送出 */}
        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? '建立中…' : '建立成員'}
          </Button>
          <Button variant="outline" type="button" asChild>
            <Link to="/admin/members">取消</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
