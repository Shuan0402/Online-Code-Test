import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'

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

export default function AdminExamDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [exam, setExam] = useState(null)
  const [usersMap, setUsersMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  // delete dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      setLoadError(null)
      try {
        // Parallel fetch: exam detail + all users for name resolution
        const [examRes, usersRes] = await Promise.all([
          api.get(`/api/v1/exams/${id}`),
          api.get('/api/v1/users/'),
        ])
        setExam(examRes.data)

        // Build usersMap: { [uuid]: full_name || username }
        const map = {}
        for (const u of usersRes.data) {
          map[u.id] = u.full_name || u.username
        }
        setUsersMap(map)
      } catch (err) {
        setLoadError(
          err.response?.data?.detail ?? '載入考試資料失敗，請稍後再試',
        )
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [id])

  async function handleDeleteConfirm() {
    setDeleting(true)
    setDeleteError(null)
    try {
      // DELETE /api/v1/exams/{id} returns 204 (no body); treat any 2xx as success
      await api.delete(`/api/v1/exams/${id}`)
      navigate('/admin/exams')
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

  if (loadError) {
    return (
      <div className="p-6">
        <ErrorMessage message={loadError} />
      </div>
    )
  }

  const candidateName = usersMap[exam.candidate_id] ?? exam.candidate_id ?? '—'

  return (
    <div className="p-6 max-w-2xl space-y-6">
      {/* 頁首 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/exams">← 返回考試列表</Link>
          </Button>
          <h1 className="text-2xl font-semibold">考試詳情</h1>
        </div>
        <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
          刪除考試
        </Button>
      </div>

      {/* 考試基本資訊 */}
      <section className="rounded-lg border bg-white p-6 shadow-sm space-y-3">
        <h2 className="text-lg font-semibold">基本資訊</h2>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <p className="text-muted-foreground font-medium">考試名稱</p>
            <p>{exam.title}</p>
          </div>

          <div className="space-y-1">
            <p className="text-muted-foreground font-medium">狀態</p>
            <ExamStatusBadge status={exam.status} />
          </div>

          <div className="space-y-1">
            <p className="text-muted-foreground font-medium">應試者</p>
            {/* Resolved via usersMap; falls back to raw UUID if not found (lesson L2) */}
            <p>{candidateName}</p>
          </div>

          <div className="space-y-1">
            <p className="text-muted-foreground font-medium">分數</p>
            <p>{exam.score != null ? exam.score : '—'}</p>
          </div>

          <div className="space-y-1">
            <p className="text-muted-foreground font-medium">時長（分鐘）</p>
            <p>{exam.duration_minutes ?? '—'}</p>
          </div>

          <div className="space-y-1">
            <p className="text-muted-foreground font-medium">開始時間</p>
            <p>{formatDatetime(exam.start_time)}</p>
          </div>

          <div className="space-y-1">
            <p className="text-muted-foreground font-medium">結束時間</p>
            <p>{formatDatetime(exam.end_time)}</p>
          </div>

          <div className="space-y-1">
            <p className="text-muted-foreground font-medium">
              題目數量（易/中/難）
            </p>
            <p>
              {exam.easy_count ?? 0} / {exam.medium_count ?? 0} /{' '}
              {exam.hard_count ?? 0}
            </p>
          </div>
        </div>
      </section>

      {/* 考試題目列表 */}
      <section className="rounded-lg border bg-white p-6 shadow-sm space-y-3">
        <h2 className="text-lg font-semibold">考試題目</h2>

        {!exam.exam_problems || exam.exam_problems.length === 0 ? (
          <p className="text-muted-foreground text-sm">此考試沒有題目</p>
        ) : (
          <div className="rounded border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">題號</th>
                  <th className="px-4 py-3 text-left font-medium">題目名稱</th>
                  <th className="px-4 py-3 text-left font-medium">難度</th>
                  <th className="px-4 py-3 text-left font-medium">配分</th>
                </tr>
              </thead>
              <tbody>
                {exam.exam_problems.map((ep) => (
                  <tr key={ep.sequence} className="border-t">
                    <td className="px-4 py-3">{ep.sequence}</td>
                    <td className="px-4 py-3">{ep.title}</td>
                    <td className="px-4 py-3">{ep.difficulty}</td>
                    <td className="px-4 py-3">{ep.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 刪除確認 Dialog */}
      <Dialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowDeleteDialog(false)
            setDeleteError(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認刪除考試</DialogTitle>
            <DialogDescription>
              確定要刪除考試「{exam.title}」嗎？此操作無法復原。
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
              onClick={() => {
                setShowDeleteDialog(false)
                setDeleteError(null)
              }}
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
