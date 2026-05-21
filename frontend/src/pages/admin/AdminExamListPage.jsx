import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import api from '@/lib/api'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import ExamStatusBadge from '@/components/ExamStatusBadge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

const EXAM_STATUSES = ['Draft', 'Published', 'Ongoing', 'Finished', 'Archived']

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

export default function AdminExamListPage() {
  const navigate = useNavigate()

  const [exams, setExams] = useState([])
  const [usersMap, setUsersMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // client-side status filter
  const [statusFilter, setStatusFilter] = useState('')

  // delete dialog state
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Step 1: get sparse exam list
      const listRes = await api.get('/api/v1/exams/')
      const sparseList = listRes.data

      // Step 2: fan-out — GET /exams/{id} for each exam + GET /users/ in parallel
      // Each ExamRead (full detail) carries candidate_id; usersMap resolves UUID → name
      const [detailResults, usersRes] = await Promise.all([
        Promise.all(sparseList.map((e) => api.get(`/api/v1/exams/${e.id}`))),
        api.get('/api/v1/users/'),
      ])

      // Build usersMap: { [uuid]: full_name || username }
      const map = {}
      for (const u of usersRes.data) {
        map[u.id] = u.full_name || u.username
      }
      setUsersMap(map)

      // Merge candidate_id from full detail back into the sparse list objects
      const enriched = sparseList.map((sparse, i) => ({
        ...sparse,
        candidate_id: detailResults[i].data.candidate_id,
      }))
      setExams(enriched)
    } catch (err) {
      setError(err.response?.data?.detail ?? '載入考試列表失敗，請稍後再試')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const filtered = statusFilter
    ? exams.filter((e) => e.status === statusFilter)
    : exams

  function openDeleteDialog(exam) {
    setDeleteTarget(exam)
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
      // DELETE /api/v1/exams/{id} returns 204 (no body); treat any 2xx as success
      await api.delete(`/api/v1/exams/${deleteTarget.id}`)
      setExams((prev) => prev.filter((e) => e.id !== deleteTarget.id))
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
        <ErrorMessage message={error} onRetry={fetchData} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      {/* 頁首 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">考試管理</h1>
      </div>

      {/* 狀態篩選 */}
      <div className="flex items-center gap-2">
        <label htmlFor="status-filter" className="text-sm font-medium">
          狀態篩選：
        </label>
        <select
          id="status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">全部</option>
          {EXAM_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* 考試列表 */}
      {filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">目前沒有考試</p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">考試名稱</th>
                <th className="px-4 py-3 text-left font-medium">考生</th>
                <th className="px-4 py-3 text-left font-medium">狀態</th>
                <th className="px-4 py-3 text-left font-medium">分數</th>
                <th className="px-4 py-3 text-left font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((exam) => (
                <tr
                  key={exam.id}
                  className="border-t hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => navigate(`/admin/exams/${exam.id}`)}
                >
                  <td className="px-4 py-3 font-medium">{exam.title}</td>
                  <td className="px-4 py-3">
                    {/* Resolve candidate UUID → display name via usersMap (lesson L2) */}
                    {usersMap[exam.candidate_id] ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <ExamStatusBadge status={exam.status} />
                  </td>
                  <td className="px-4 py-3">
                    {exam.score != null ? exam.score : '—'}
                  </td>
                  <td
                    className="px-4 py-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => openDeleteDialog(exam)}
                    >
                      刪除
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 刪除確認 Dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) closeDeleteDialog()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認刪除考試</DialogTitle>
            <DialogDescription>
              確定要刪除考試「{deleteTarget?.title}」嗎？此操作無法復原。
            </DialogDescription>
          </DialogHeader>

          {deleteError && (
            <p className="text-sm font-medium text-destructive">
              {deleteError}
            </p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeDeleteDialog}
              disabled={deleting}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? '刪除中…' : '確認刪除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
