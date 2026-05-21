import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'

import api from '@/lib/api'
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

// 難度的中文顯示（與 Questioner 面板一致）
const DIFFICULTY_LABELS = {
  Easy: '簡單',
  Medium: '中等',
  Hard: '困難',
}

// 難度標籤的顏色樣式（與 Questioner 面板一致）
const DIFFICULTY_COLORS = {
  Easy: 'bg-green-100 text-green-800',
  Medium: 'bg-yellow-100 text-yellow-800',
  Hard: 'bg-red-100 text-red-800',
}

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

export default function AdminProblemDetailPage() {
  // problem_id is an int in the URL
  const { id } = useParams()
  const navigate = useNavigate()

  const [problem, setProblem] = useState(null)
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
        // problem_id is an int — pass as-is in the URL path
        const res = await api.get(`/api/v1/problems/${id}`)
        setProblem(res.data)
      } catch (err) {
        setLoadError(err.response?.data?.detail ?? '載入題目資料失敗，請稍後再試')
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
      // DELETE /api/v1/problems/{id} returns 204 (empty body); treat any 2xx as success
      await api.delete(`/api/v1/problems/${id}`)
      navigate('/admin/problems')
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

  return (
    <div className="p-6 max-w-3xl space-y-6">
      {/* 頁首 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/problems">← 返回題目列表</Link>
          </Button>
          <h1 className="text-2xl font-semibold">題目詳情</h1>
        </div>
        <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
          刪除題目
        </Button>
      </div>

      {/* 題目基本資訊 */}
      <section className="rounded-lg border bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">基本資訊</h2>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="col-span-2 space-y-1">
            <p className="text-muted-foreground font-medium">題目名稱</p>
            <p className="font-medium">{problem.title}</p>
          </div>

          <div className="space-y-1">
            <p className="text-muted-foreground font-medium">難度</p>
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                DIFFICULTY_COLORS[problem.difficulty] ?? 'bg-gray-100 text-gray-700'
              }`}
            >
              {DIFFICULTY_LABELS[problem.difficulty] ?? problem.difficulty}
            </span>
          </div>

          <div className="space-y-1">
            <p className="text-muted-foreground font-medium">時間限制</p>
            <p>{problem.time_limit != null ? `${problem.time_limit} ms` : '—'}</p>
          </div>

          <div className="space-y-1">
            <p className="text-muted-foreground font-medium">記憶體限制</p>
            <p>{problem.memory_limit != null ? `${problem.memory_limit} MB` : '—'}</p>
          </div>

          <div className="space-y-1">
            <p className="text-muted-foreground font-medium">建立者 ID</p>
            <p className="font-mono text-xs break-all">{problem.creator_id ?? '—'}</p>
          </div>

          <div className="space-y-1">
            <p className="text-muted-foreground font-medium">建立時間</p>
            <p>{formatDatetime(problem.created_at)}</p>
          </div>
        </div>

        {/* 題目描述 */}
        <div className="space-y-1">
          <p className="text-muted-foreground font-medium">題目描述</p>
          <pre className="whitespace-pre-wrap text-sm bg-muted/30 rounded-md p-3 border">
            {problem.description ?? '（無描述）'}
          </pre>
        </div>
      </section>

      {/* 測試案例 */}
      <section className="rounded-lg border bg-white p-6 shadow-sm space-y-3">
        <h2 className="text-lg font-semibold">測試案例</h2>

        {!problem.test_cases || problem.test_cases.length === 0 ? (
          <p className="text-muted-foreground text-sm">此題目沒有測試案例</p>
        ) : (
          <div className="rounded border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium w-8">#</th>
                  <th className="px-4 py-3 text-left font-medium">輸入</th>
                  <th className="px-4 py-3 text-left font-medium">預期輸出</th>
                  <th className="px-4 py-3 text-left font-medium w-20">配分權重</th>
                  <th className="px-4 py-3 text-left font-medium w-20">範例</th>
                </tr>
              </thead>
              <tbody>
                {problem.test_cases.map((tc, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="px-4 py-3 text-muted-foreground">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <pre className="whitespace-pre-wrap font-mono text-xs">{tc.input_data}</pre>
                    </td>
                    <td className="px-4 py-3">
                      <pre className="whitespace-pre-wrap font-mono text-xs">{tc.expected_output}</pre>
                    </td>
                    <td className="px-4 py-3">{tc.score_weight}</td>
                    <td className="px-4 py-3">{tc.is_sample ? '是' : '否'}</td>
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
            <DialogTitle>確認刪除題目</DialogTitle>
            <DialogDescription>
              確定要刪除題目「{problem.title}」嗎？此操作無法復原。
            </DialogDescription>
          </DialogHeader>

          {deleteError && (
            <p className="text-sm font-medium text-destructive">{deleteError}</p>
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
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleting}>
              {deleting ? '刪除中…' : '確認刪除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
