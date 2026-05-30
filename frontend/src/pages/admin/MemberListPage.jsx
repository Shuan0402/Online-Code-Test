import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'

import api from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

function formatDatetime(isoStr) {
  if (!isoStr) return '—'
  return new Date(isoStr).toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const ROLES = ['Admin', 'Candidate', 'Interviewer', 'Questioner']

export default function MemberListPage() {
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()

  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // client-side role filter
  const [roleFilter, setRoleFilter] = useState('')

  // delete dialog state
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const fetchMembers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get('/api/v1/users/')
      setMembers(res.data)
    } catch (err) {
      setError(err.response?.data?.detail ?? '載入成員列表失敗，請稍後再試')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  const filtered = roleFilter
    ? members.filter((m) => m.role === roleFilter)
    : members

  function openDeleteDialog(member) {
    setDeleteTarget(member)
    setDeleteError(null)
  }

  function closeDeleteDialog() {
    setDeleteTarget(null)
    setDeleteError(null)
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)
    try {
      // DELETE /api/v1/users/{id} returns HTTP 200 (not 204) with a {detail} body
      await api.delete(`/api/v1/users/${deleteTarget.id}`)
      setMembers((prev) => prev.filter((m) => m.id !== deleteTarget.id))
      closeDeleteDialog()
    } catch (err) {
      setDeleteError(err.response?.data?.detail ?? '刪除失敗，請稍後再試')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <ErrorMessage message={error} onRetry={fetchMembers} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      {/* 頁首 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">成員管理</h1>
        <Button onClick={() => navigate('/admin/members/new')}>新增成員</Button>
      </div>

      {/* 角色篩選 */}
      <div className="flex items-center gap-2">
        <label htmlFor="role-filter" className="text-sm font-medium">
          角色篩選：
        </label>
        <select
          id="role-filter"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">全部</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      {/* 成員列表 */}
      {filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">目前沒有成員</p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">姓名</th>
                <th className="px-4 py-3 text-left font-medium">帳號</th>
                <th className="px-4 py-3 text-left font-medium">角色</th>
                <th className="px-4 py-3 text-left font-medium w-44">建立時間</th>
                <th className="px-4 py-3 text-left font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((member) => {
                const isSelf = currentUser && member.id === currentUser.id
                return (
                  <tr
                    key={member.id}
                    className="border-t hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => navigate(`/admin/members/${member.id}`)}
                  >
                    <td
                      className="px-4 py-3 font-medium max-w-[220px] truncate"
                      title={member.full_name ?? member.username ?? ''}
                    >
                      {member.full_name ?? member.username ?? '—'}
                    </td>
                    <td className="px-4 py-3">{member.username}</td>
                    <td className="px-4 py-3">{member.role}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDatetime(member.created_at)}
                    </td>
                    <td
                      className="px-4 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/admin/members/${member.id}`}>查看</Link>
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={isSelf}
                          onClick={() => openDeleteDialog(member)}
                        >
                          刪除
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 刪除確認 Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) closeDeleteDialog() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認刪除成員</DialogTitle>
            <DialogDescription>
              確定要刪除成員「{deleteTarget?.full_name ?? deleteTarget?.username}」嗎？此操作無法復原。
            </DialogDescription>
          </DialogHeader>

          {deleteError && (
            <p className="text-sm font-medium text-destructive">{deleteError}</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDeleteDialog} disabled={deleting}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleting}>
              {deleting ? '刪除中…' : '確認刪除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
