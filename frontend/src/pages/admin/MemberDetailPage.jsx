import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'

import api from '@/lib/api'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import { Button } from '@/components/ui/button'

const ROLES = ['Admin', 'Candidate', 'Interviewer', 'Questioner']

export default function MemberDetailPage() {
  const { id } = useParams()

  const [member, setMember] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  // 編輯使用者資訊 form state
  const [editFullName, setEditFullName] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editError, setEditError] = useState(null)
  const [editSuccess, setEditSuccess] = useState(null)
  const [editing, setEditing] = useState(false)

  // 修改密碼 form state
  const [newPassword, setNewPassword] = useState('')
  const [pwError, setPwError] = useState(null)
  const [pwSuccess, setPwSuccess] = useState(null)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    async function loadMember() {
      setLoading(true)
      setLoadError(null)
      try {
        const res = await api.get(`/api/v1/users/${id}`)
        setMember(res.data)
        setEditFullName(res.data.full_name ?? '')
        setEditRole(res.data.role)
      } catch (err) {
        const status = err.response?.status
        if (status === 404) {
          setLoadError('找不到該使用者')
        } else {
          setLoadError(err.response?.data?.detail ?? '載入使用者資料失敗，請稍後再試')
        }
      } finally {
        setLoading(false)
      }
    }
    loadMember()
  }, [id])

  async function handleEditSubmit(e) {
    e.preventDefault()
    setEditError(null)
    setEditSuccess(null)
    setEditing(true)
    try {
      // PATCH body: {full_name, role} only — username is immutable and must NOT be sent
      const res = await api.patch(`/api/v1/users/${id}`, {
        full_name: editFullName.trim() || null,
        role: editRole,
      })
      setMember(res.data)
      setEditFullName(res.data.full_name ?? '')
      setEditRole(res.data.role)
      setEditSuccess('使用者資訊已更新')
    } catch (err) {
      const detail = err.response?.data?.detail
      setEditError(typeof detail === 'string' ? detail : '更新失敗，請稍後再試')
    } finally {
      setEditing(false)
    }
  }

  async function handlePasswordReset(e) {
    e.preventDefault()
    setPwError(null)
    setPwSuccess(null)

    if (newPassword.length < 8) {
      setPwError('密碼至少需要 8 個字元')
      return
    }

    setResetting(true)
    try {
      // Admin force-reset: PUT /users/{id}/password-reset — no old password needed
      await api.put(`/api/v1/users/${id}/password-reset`, { new_password: newPassword })
      setNewPassword('')
      setPwSuccess('密碼已重設')
    } catch (err) {
      const detail = err.response?.data?.detail
      setPwError(typeof detail === 'string' ? detail : '重設密碼失敗，請稍後再試')
    } finally {
      setResetting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="p-6">
        <ErrorMessage message={loadError} />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-lg space-y-6">
      {/* 頁首 */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link to="/admin/members">← 返回成員列表</Link>
        </Button>
        <h1 className="text-2xl font-semibold">使用者資訊</h1>
      </div>

      {/* 唯讀資訊卡 */}
      <section className="rounded-lg border bg-white p-6 shadow-sm space-y-3">
        <h2 className="text-lg font-semibold">基本資料</h2>

        <div className="space-y-1">
          <label className="text-sm font-medium text-muted-foreground">姓名</label>
          <p className="text-sm border rounded-md px-3 py-2 bg-muted">
            {member.full_name ?? '—'}
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-muted-foreground">帳號（不可更改）</label>
          <p className="text-sm border rounded-md px-3 py-2 bg-muted">{member.username}</p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-muted-foreground">角色</label>
          <p className="text-sm border rounded-md px-3 py-2 bg-muted">{member.role}</p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-muted-foreground">密碼</label>
          {/* There is no password field in UserRead — always render a masked placeholder */}
          <p className="text-sm border rounded-md px-3 py-2 bg-muted tracking-widest">
            ••••••••
          </p>
        </div>
      </section>

      {/* 編輯使用者資訊 */}
      <section className="rounded-lg border bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">編輯使用者資訊</h2>

        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="edit-full-name" className="text-sm font-medium">
              姓名
            </label>
            <input
              id="edit-full-name"
              type="text"
              value={editFullName}
              onChange={(e) => setEditFullName(e.target.value)}
              maxLength={100}
              placeholder="選填"
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="edit-role" className="text-sm font-medium">
              角色
            </label>
            <select
              id="edit-role"
              value={editRole}
              onChange={(e) => setEditRole(e.target.value)}
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {editError && (
            <p className="text-sm font-medium text-destructive">{editError}</p>
          )}
          {editSuccess && (
            <p className="text-sm font-medium text-green-600">{editSuccess}</p>
          )}

          <Button type="submit" disabled={editing}>
            {editing ? '儲存中…' : '儲存變更'}
          </Button>
        </form>
      </section>

      {/* 修改密碼 */}
      <section className="rounded-lg border bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">修改密碼</h2>

        <form onSubmit={handlePasswordReset} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="new-password" className="text-sm font-medium">
              新密碼
            </label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="至少 8 個字元"
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {pwError && (
            <p className="text-sm font-medium text-destructive">{pwError}</p>
          )}
          {pwSuccess && (
            <p className="text-sm font-medium text-green-600">{pwSuccess}</p>
          )}

          <Button type="submit" disabled={resetting}>
            {resetting ? '重設中…' : '重設密碼'}
          </Button>
        </form>
      </section>
    </div>
  )
}
