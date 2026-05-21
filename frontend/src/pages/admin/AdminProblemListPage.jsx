import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

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

// 難度標籤的顏色樣式（與 Questioner 面板一致）
const DIFFICULTY_COLORS = {
  Easy: 'bg-green-100 text-green-800',
  Medium: 'bg-yellow-100 text-yellow-800',
  Hard: 'bg-red-100 text-red-800',
}

// 難度的中文顯示（與 Questioner 面板一致）
const DIFFICULTY_LABELS = {
  Easy: '簡單',
  Medium: '中等',
  Hard: '困難',
}

const DIFFICULTY_OPTIONS = [
  { label: '全部', value: '' },
  { label: '簡單', value: 'Easy' },
  { label: '中等', value: 'Medium' },
  { label: '困難', value: 'Hard' },
]

export default function AdminProblemListPage() {
  const navigate = useNavigate()

  const [problems, setProblems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // client-side 難度篩選
  const [difficultyFilter, setDifficultyFilter] = useState('')

  // 刪除確認 Dialog 狀態
  const [deleteTarget, setDeleteTarget] = useState(null) // { id, title }
  const [deleteError, setDeleteError] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const fetchProblems = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get('/api/v1/problems/')
      setProblems(res.data)
    } catch (err) {
      setError(err.response?.data?.detail ?? '載入題目失敗，請稍後再試')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProblems()
  }, [fetchProblems])

  // client-side 篩選（不重新 fetch）
  const filteredProblems = difficultyFilter
    ? problems.filter((p) => p.difficulty === difficultyFilter)
    : problems

  function openDeleteDialog(problem) {
    setDeleteError(null)
    setDeleteTarget({ id: problem.id, title: problem.title })
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)
    try {
      // DELETE /api/v1/problems/{id} returns 204 (empty body); await without .data
      await api.delete(`/api/v1/problems/${deleteTarget.id}`)
      setProblems((prev) => prev.filter((p) => p.id !== deleteTarget.id))
      setDeleteTarget(null)
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
        <ErrorMessage message={error} onRetry={fetchProblems} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      {/* 頁首 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">題目管理</h1>
      </div>

      {/* 難度篩選 */}
      <div className="flex items-center gap-2">
        <label htmlFor="difficulty-filter" className="text-sm font-medium text-muted-foreground">
          難度篩選：
        </label>
        <select
          id="difficulty-filter"
          aria-label="難度篩選"
          value={difficultyFilter}
          onChange={(e) => setDifficultyFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {DIFFICULTY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* 題目列表 */}
      {filteredProblems.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">
          {difficultyFilter ? '沒有符合條件的題目' : '目前沒有題目'}
        </p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium w-8">#</th>
                <th className="px-4 py-3 text-left font-medium">題目名稱</th>
                <th className="px-4 py-3 text-left font-medium w-24">難度</th>
                <th className="px-4 py-3 text-left font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredProblems.map((problem, idx) => (
                <tr
                  key={problem.id}
                  className="border-t hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => navigate(`/admin/problems/${problem.id}`)}
                >
                  <td className="px-4 py-3 text-muted-foreground">{idx + 1}</td>
                  <td className="px-4 py-3 font-medium">{problem.title}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                        DIFFICULTY_COLORS[problem.difficulty] ?? 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {DIFFICULTY_LABELS[problem.difficulty] ?? problem.difficulty}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        openDeleteDialog(problem)
                      }}
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
              確定要刪除題目「{deleteTarget?.title}」嗎？此操作無法復原。
            </DialogDescription>
          </DialogHeader>

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
              disabled={deleting}
            >
              取消
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? '刪除中…' : '確認刪除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
