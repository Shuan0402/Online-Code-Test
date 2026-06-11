import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'

import api from '@/lib/api'
import TagMultiSelect from '@/components/TagMultiSelect'
import { Button } from '@/components/ui/button'

export default function CandidateFormPage() {
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [tags, setTags] = useState([])
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
        role: 'Candidate',
        tags,
      }
      const res = await api.post('/api/v1/users/', body)
      // 201 → 導向新建考生的詳情頁
      navigate(`/interviewer/candidates/${res.data.id}`)
    } catch (err) {
      const detail = err.response?.data?.detail
      if (Array.isArray(detail)) {
        setFormError(detail.map((d) => d.msg).join('；'))
      } else {
        setFormError(detail ?? '建立考生帳號失敗，請稍後再試')
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
          <Link to="/interviewer/candidates">← 返回考生列表</Link>
        </Button>
        <h1 className="text-2xl font-semibold">新增考生</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
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
            required
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
            required
            className="w-full rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* 考生標籤 */}
        <TagMultiSelect
          value={tags}
          onChange={setTags}
          label="考生標籤（選填）"
          containerId="candidate-form-tags"
        />

        {/* 表單錯誤訊息 */}
        {formError && (
          <p className="text-sm font-medium text-destructive">{formError}</p>
        )}

        {/* 送出 */}
        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? '建立中…' : '建立考生'}
          </Button>
          <Button variant="outline" type="button" asChild>
            <Link to="/interviewer/candidates">取消</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
