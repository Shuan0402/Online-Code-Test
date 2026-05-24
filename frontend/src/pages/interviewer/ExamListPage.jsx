import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'

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

// 格式化日期時間為可讀字串
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

// 狀態篩選選項（與 ExamStatusBadge 的 enum 值一致）
const STATUS_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'Draft', label: '草稿' },
  { value: 'Published', label: '已發佈' },
  { value: 'Ongoing', label: '進行中' },
  { value: 'Finished', label: '已結束' },
  { value: 'Archived', label: '已封存' },
]

export default function ExamListPage() {
  const navigate = useNavigate()

  const [exams, setExams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // 狀態篩選（client-side，不發新 API 請求）
  const [statusFilter, setStatusFilter] = useState('')

  // 刪除確認 Dialog 狀態
  const [deleteTarget, setDeleteTarget] = useState(null) // { id, title }
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const fetchExams = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get('/api/v1/exams/')
      setExams(res.data)
    } catch (err) {
      setError(err.response?.data?.detail ?? '載入考試列表失敗，請稍後再試')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchExams()
  }, [fetchExams])

  // --- 刪除考試 ---
  const openDeleteDialog = (exam) => {
    setDeleteError(null)
    setDeleteTarget({ id: exam.id, title: exam.title })
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      await api.delete(`/api/v1/exams/${deleteTarget.id}`)
      // 刪除成功後從 state 中移除該筆（不重新 fetch）
      setExams((prev) => prev.filter((e) => e.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) {
      // 顯示 inline 錯誤，Dialog 保持開著讓使用者知道失敗
      setDeleteError(err.response?.data?.detail ?? '刪除失敗，請稍後再試')
    } finally {
      setDeleteLoading(false)
    }
  }

  // 依狀態篩選（client-side）：statusFilter 為空字串時顯示全部
  const filteredExams = statusFilter
    ? exams.filter((e) => e.status === statusFilter)
    : exams

  // --- 渲染 ---
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
        <ErrorMessage message={error} onRetry={fetchExams} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      {/* 頁首：標題 + 新增按鈕 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">考試列表</h1>
        <Button onClick={() => navigate('/interviewer/exams/new')}>
          新增考試
        </Button>
      </div>

      {/* 狀態篩選 */}
      <div className="flex items-center gap-2">
        <label htmlFor="status-filter" className="text-sm font-medium">
          篩選狀態：
        </label>
        <select
          id="status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* 考試列表 */}
      {filteredExams.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">目前沒有考試</p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">考試標題</th>
                <th className="px-4 py-3 text-left font-medium w-28">狀態</th>
                <th className="px-4 py-3 text-left font-medium w-28">時長</th>
                <th className="px-4 py-3 text-left font-medium w-24">分數</th>
                <th className="px-4 py-3 text-left font-medium w-44">建立時間</th>
                <th className="px-4 py-3 text-left font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredExams.map((exam) => (
                <tr
                  key={exam.id}
                  className="border-t hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3 font-medium">{exam.title}</td>
                  <td className="px-4 py-3">
                    <ExamStatusBadge status={exam.status} />
                  </td>
                  <td className="px-4 py-3">{exam.duration_minutes} 分鐘</td>
                  <td className="px-4 py-3">
                    {exam.score != null ? `${exam.score} 分` : '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDatetime(exam.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {/* 查看詳情 */}
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/interviewer/exams/${exam.id}`}>查看</Link>
                      </Button>

                      {/* 刪除 */}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => openDeleteDialog(exam)}
                      >
                        刪除
                      </Button>
                    </div>
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
          if (!open) {
            setDeleteTarget(null)
            setDeleteError(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認刪除</DialogTitle>
            <DialogDescription>
              確定要刪除考試「{deleteTarget?.title}」嗎？此操作無法復原。
            </DialogDescription>
          </DialogHeader>
          {/* 刪除失敗的 inline 錯誤訊息 */}
          {deleteError && (
            <p className="text-sm font-medium text-destructive">{deleteError}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteTarget(null)
                setDeleteError(null)
              }}
              disabled={deleteLoading}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteLoading}
            >
              {deleteLoading ? '刪除中…' : '確認刪除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
