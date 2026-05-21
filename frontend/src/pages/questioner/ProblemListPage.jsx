import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'

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

// 難度對應：UI 顯示文字 → API enum 值
const DIFFICULTY_OPTIONS = [
  { label: '全部', value: '' },
  { label: '簡單', value: 'Easy' },
  { label: '中等', value: 'Medium' },
  { label: '困難', value: 'Hard' },
]

// 難度標籤的顏色樣式
const DIFFICULTY_COLORS = {
  Easy: 'bg-green-100 text-green-800',
  Medium: 'bg-yellow-100 text-yellow-800',
  Hard: 'bg-red-100 text-red-800',
}

// 難度的中文顯示
const DIFFICULTY_LABELS = {
  Easy: '簡單',
  Medium: '中等',
  Hard: '困難',
}

export default function ProblemListPage() {
  const navigate = useNavigate()

  // 全部題目（從 API 載入後保存，不因篩選而改變）
  const [problems, setProblems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // 難度篩選狀態（client-side，不重新 fetch）
  const [difficultyFilter, setDifficultyFilter] = useState('')

  // 刪除確認 Dialog 狀態
  const [deleteTarget, setDeleteTarget] = useState(null) // { id, title }
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  // 重測回饋訊息：{ [problemId]: '已觸發 N 筆重測' }
  const [rejudgeMsgs, setRejudgeMsgs] = useState({})
  // 正在重測的題目 id set
  const [rejudging, setRejudging] = useState(new Set())

  // 載入題目列表
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

  // 依難度篩選（client-side）
  const filteredProblems = difficultyFilter
    ? problems.filter((p) => p.difficulty === difficultyFilter)
    : problems

  // --- 刪除題目 ---
  const openDeleteDialog = (problem) => {
    setDeleteError(null)
    setDeleteTarget({ id: problem.id, title: problem.title })
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      await api.delete(`/api/v1/problems/${deleteTarget.id}`)
      // 刪除成功後從 state 中移除該筆（不重新 fetch）
      setProblems((prev) => prev.filter((p) => p.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) {
      // 顯示 inline 錯誤，Dialog 保持開著讓使用者知道失敗
      setDeleteError(err.response?.data?.detail ?? '刪除失敗，請稍後再試')
    } finally {
      setDeleteLoading(false)
    }
  }

  // --- 重測 ---
  const handleRejudge = async (problem) => {
    if (rejudging.has(problem.id)) return
    setRejudging((prev) => new Set(prev).add(problem.id))
    // 清除舊訊息
    setRejudgeMsgs((prev) => ({ ...prev, [problem.id]: null }))
    try {
      const res = await api.post(`/api/v1/problems/${problem.id}/rejudge`)
      const count = res.data.submissions_triggered ?? 0
      setRejudgeMsgs((prev) => ({
        ...prev,
        [problem.id]: `已觸發 ${count} 筆重測`,
      }))
    } catch (err) {
      setRejudgeMsgs((prev) => ({
        ...prev,
        [problem.id]: err.response?.data?.detail ?? '重測失敗',
      }))
    } finally {
      setRejudging((prev) => {
        const next = new Set(prev)
        next.delete(problem.id)
        return next
      })
    }
  }

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
        <ErrorMessage message={error} onRetry={fetchProblems} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      {/* 頁首：標題 + 新增按鈕 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">題目列表</h1>
        <Button onClick={() => navigate('/questioner/problems/new')}>
          新增題目
        </Button>
      </div>

      {/* 難度篩選 */}
      <div className="flex items-center gap-2">
        <label htmlFor="difficulty-filter" className="text-sm font-medium text-muted-foreground">
          難度篩選：
        </label>
        <select
          id="difficulty-filter"
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
                  className="border-t hover:bg-muted/30 transition-colors"
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
                    <div className="flex flex-wrap items-center gap-2">
                      {/* 編輯 */}
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                      >
                        <Link to={`/questioner/problems/${problem.id}/edit`}>
                          編輯
                        </Link>
                      </Button>

                      {/* 查看提交 */}
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                      >
                        <Link to={`/questioner/problems/${problem.id}/submissions`}>
                          查看提交
                        </Link>
                      </Button>

                      {/* 重測 */}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleRejudge(problem)}
                        disabled={rejudging.has(problem.id)}
                      >
                        {rejudging.has(problem.id) ? '處理中…' : '重測'}
                      </Button>

                      {/* 刪除 */}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => openDeleteDialog(problem)}
                      >
                        刪除
                      </Button>

                      {/* 重測結果訊息（inline） */}
                      {rejudgeMsgs[problem.id] && (
                        <span className="text-xs text-muted-foreground">
                          {rejudgeMsgs[problem.id]}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 刪除確認 Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteError(null) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認刪除</DialogTitle>
            <DialogDescription>
              確定要刪除題目「{deleteTarget?.title}」嗎？此操作無法復原。
            </DialogDescription>
          </DialogHeader>
          {/* 刪除失敗的 inline 錯誤訊息 */}
          {deleteError && (
            <p className="text-sm font-medium text-destructive">{deleteError}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setDeleteTarget(null); setDeleteError(null) }}
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
