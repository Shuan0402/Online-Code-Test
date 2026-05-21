import { useState, useEffect } from 'react'
import api from '@/lib/api'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'

// Chinese labels for role enum values.
const ROLE_LABEL = {
  Candidate: '考生',
  Questioner: '出題者',
  Interviewer: '面試官',
  Admin: '管理員',
}

export default function ProfilePage() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Profile edit form state
  const [fullName, setFullName] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSuccess, setProfileSuccess] = useState('')

  // Password change form state
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState('')

  useEffect(() => {
    async function loadMe() {
      try {
        const res = await api.get('/api/v1/users/me')
        setUser(res.data)
        setFullName(res.data.full_name ?? '')
      } catch (err) {
        setLoadError('無法載入個人資料，請重試。')
      } finally {
        setLoading(false)
      }
    }
    loadMe()
  }, [])

  async function handleProfileSave(e) {
    e.preventDefault()
    setProfileError('')
    setProfileSuccess('')
    setProfileSaving(true)
    try {
      // Only send full_name — UserUpdate has no username field; do NOT send role.
      const res = await api.patch('/api/v1/users/me', { full_name: fullName || null })
      setUser(res.data)
      setFullName(res.data.full_name ?? '')
      setProfileSuccess('個人資料已更新')
    } catch (err) {
      const detail = err.response?.data?.detail
      setProfileError(typeof detail === 'string' ? detail : '更新失敗，請重試。')
    } finally {
      setProfileSaving(false)
    }
  }

  async function handlePasswordChange(e) {
    e.preventDefault()
    setPwError('')
    setPwSuccess('')

    if (newPassword.length < 8) {
      setPwError('新密碼至少需要 8 個字元')
      return
    }
    if (newPassword !== confirmPassword) {
      setPwError('新密碼與確認密碼不一致')
      return
    }

    setPwSaving(true)
    try {
      await api.put('/api/v1/users/me/password', {
        old_password: oldPassword,
        new_password: newPassword,
      })
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPwSuccess('密碼已更新')
    } catch (err) {
      const detail = err.response?.data?.detail
      setPwError(typeof detail === 'string' ? detail : '修改密碼失敗，請確認目前密碼是否正確。')
    } finally {
      setPwSaving(false)
    }
  }

  if (loading) return <LoadingSpinner />
  if (loadError) return <ErrorMessage message={loadError} />

  return (
    <div className="max-w-lg space-y-8">
      <h1 className="text-2xl font-bold">個人資料</h1>

      {/* ── Section 1: Profile edit ── */}
      <section className="rounded-lg border bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">基本資料</h2>

        {/* Read-only fields */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-muted-foreground">帳號</label>
          <p className="text-sm border rounded-md px-3 py-2 bg-muted">{user.username}</p>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-muted-foreground">角色</label>
          <p className="text-sm border rounded-md px-3 py-2 bg-muted">
            {ROLE_LABEL[user.role] ?? user.role}
          </p>
        </div>

        {/* Editable field */}
        <form onSubmit={handleProfileSave} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="fullName" className="text-sm font-medium">姓名</label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={100}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="選填"
            />
          </div>

          {profileError && (
            <p className="text-sm text-destructive">{profileError}</p>
          )}
          {profileSuccess && (
            <p className="text-sm text-green-600">{profileSuccess}</p>
          )}

          <button
            type="submit"
            disabled={profileSaving}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {profileSaving ? '儲存中…' : '儲存變更'}
          </button>
        </form>
      </section>

      {/* ── Section 2: Password change ── */}
      <section className="rounded-lg border bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">修改密碼</h2>

        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="oldPassword" className="text-sm font-medium">目前密碼</label>
            <input
              id="oldPassword"
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              required
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="newPassword" className="text-sm font-medium">新密碼</label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="confirmPassword" className="text-sm font-medium">確認新密碼</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {pwError && (
            <p className="text-sm text-destructive">{pwError}</p>
          )}
          {pwSuccess && (
            <p className="text-sm text-green-600">{pwSuccess}</p>
          )}

          <button
            type="submit"
            disabled={pwSaving}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {pwSaving ? '更新中…' : '更新密碼'}
          </button>
        </form>
      </section>
    </div>
  )
}
