import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'

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
  const location = useLocation()

  const [exams, setExams] = useState([])
  const [loading, setLoading] = useState(true)
  // 區分「首次載入」vs「換篩選時 refetch」：refetch 時不重新顯示全頁 spinner、保留現有列表
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [error, setError] = useState(null)

  // 狀態篩選（client-side，不發新 API 請求）
  const [statusFilter, setStatusFilter] = useState('')
  // 標籤篩選（server-side filter）
  const [tagFilter, setTagFilter] = useState('')
  const [existingTags, setExistingTags] = useState([])
  // 「只看我的」切換（server-side filter，會重新發 API 請求）
  const [mineOnly, setMineOnly] = useState(false)
  // 時間區段篩選（server-side filter，YYYY-MM-DD）
  const [createdStart, setCreatedStart] = useState('')
  const [createdEnd, setCreatedEnd] = useState('')
  // 答對率區間篩選（server-side filter，0-100 %）
  const [scoreGte, setScoreGte] = useState('')
  const [scoreLte, setScoreLte] = useState('')

  // 批次建立結果通知
  const [batchResult, setBatchResult] = useState(null)
  const [batchResultVisible, setBatchResultVisible] = useState(true)

  // 多選狀態
  const [selectedIds, setSelectedIds] = useState(new Set())

  // 批量操作狀態
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkError, setBulkError] = useState(null)

  useEffect(() => {
    if (location.state?.batchResult) {
      setBatchResult(location.state.batchResult)
      setBatchResultVisible(true)
      // 清除 state 避免重新整理後再顯示
      window.history.replaceState({}, document.title)
    }
  }, [location.state])

  // 刪除確認 Dialog 狀態
  const [deleteTarget, setDeleteTarget] = useState(null) // { id, title }
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const fetchExams = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = {}
      if (mineOnly) params.mine = true
      if (tagFilter) params.tag = tagFilter
      if (createdStart) params.created_start = createdStart
      if (createdEnd) params.created_end = createdEnd
      if (scoreGte !== '') params.score_gte = Number(scoreGte)
      if (scoreLte !== '') params.score_lte = Number(scoreLte)
      const res = await api.get('/api/v1/exams/', { params })
      setExams(res.data)
      setSelectedIds(new Set())
    } catch (err) {
      setError(err.response?.data?.detail ?? '載入考試列表失敗，請稍後再試')
    } finally {
      setLoading(false)
      setHasLoadedOnce(true)
    }
  }, [mineOnly, tagFilter, createdStart, createdEnd, scoreGte, scoreLte])

  const resetFilters = () => {
    setStatusFilter('')
    setTagFilter('')
    setMineOnly(false)
    setCreatedStart('')
    setCreatedEnd('')
    setScoreGte('')
    setScoreLte('')
  }

  useEffect(() => {
    fetchExams()
  }, [fetchExams])

  useEffect(() => {
    api.get('/api/v1/exams/tags')
      .then((res) => {
        setExistingTags(res.data ?? [])
      })
      .catch((err) => {
        console.error('無法載入標籤篩選列表', err)
      })
  }, [])

  // 依狀態篩選（client-side）：statusFilter 為空字串時顯示全部
  // 注意：此處必須在所有引用 filteredExams 的程式碼之前定義
  const filteredExams = statusFilter
    ? exams.filter((e) => e.status === statusFilter)
    : exams

  const allSelected = filteredExams.length > 0 && selectedIds.size === filteredExams.length

  // --- 多選邏輯 ---
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredExams.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredExams.map((e) => e.id)))
    }
  }

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // --- 批量發布 ---
  const handleBatchPublish = async () => {
    if (selectedIds.size === 0) return
    setBulkLoading(true)
    setBulkError(null)
    try {
      const res = await api.post('/api/v1/exams/batch/publish', {
        exam_ids: Array.from(selectedIds),
      })
      const result = res.data
      alert(`發布完成：${result.success_count} 筆成功，${result.failed_count} 筆失敗`)
      fetchExams()
    } catch (err) {
      setBulkError(err.response?.data?.detail ?? '批量發布失敗')
    } finally {
      setBulkLoading(false)
    }
  }

  // --- 批量刪除 ---
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return
    if (!window.confirm(`確定要刪除/封存選取的 ${selectedIds.size} 場考試嗎？`)) return
    setBulkLoading(true)
    setBulkError(null)
    try {
      const res = await api.post('/api/v1/exams/batch/delete', {
        exam_ids: Array.from(selectedIds),
      })
      const result = res.data
      alert(`刪除完成：${result.success_count} 筆成功，${result.failed_count} 筆失敗`)
      fetchExams()
    } catch (err) {
      setBulkError(err.response?.data?.detail ?? '批量刪除失敗')
    } finally {
      setBulkLoading(false)
    }
  }

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
      setExams((prev) => prev.filter((e) => e.id !== deleteTarget.id))
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(deleteTarget.id)
        return next
      })
      setDeleteTarget(null)
    } catch (err) {
      setDeleteError(err.response?.data?.detail ?? '刪除失敗，請稍後再試')
    } finally {
      setDeleteLoading(false)
    }
  }

  // --- 渲染 ---
  if (loading && !hasLoadedOnce) {
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
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate('/interviewer/exams/batch-new')}>
            批次新增
          </Button>
          <Button onClick={() => navigate('/interviewer/exams/new')}>
            新增考試
          </Button>
        </div>
      </div>

      {/* 批次建立結果通知 */}
      {batchResult && batchResultVisible && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${
          batchResult.failed_count > 0
            ? 'bg-amber-50 border-amber-200 text-amber-800'
            : 'bg-green-50 border-green-200 text-green-800'
        }`}>
          <div className="flex items-center justify-between">
            <span>
              批次建立完成：
              <span className="font-medium">{batchResult.success_count}</span> 筆成功
              {batchResult.failed_count > 0 && (
                <>, <span className="font-medium">{batchResult.failed_count}</span> 筆失敗</>
              )}
              （共 <span className="font-medium">{batchResult.total_requested}</span> 位考生）
            </span>
            <button
              onClick={() => {
                setBatchResultVisible(false)
                fetchExams()
              }}
              className="text-xs font-medium underline hover:no-underline"
            >
              關閉並重新整理
            </button>
          </div>
        </div>
      )}

      {/* 篩選列 */}
      <div className="flex items-center gap-4 flex-wrap rounded-lg border bg-muted/20 p-3">
        <div className="flex items-center gap-2">
          <label htmlFor="status-filter" className="text-sm font-medium whitespace-nowrap">
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

        <div className="flex items-center gap-2">
          <label htmlFor="tag-filter" className="text-sm font-medium whitespace-nowrap">
            篩選標籤：
          </label>
          <select
            id="tag-filter"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">全部</option>
            {existingTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <button
          id="mine-only-toggle"
          type="button"
          onClick={() => setMineOnly((prev) => !prev)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium border transition-colors whitespace-nowrap ${
            mineOnly
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-foreground border-input hover:bg-muted'
          }`}
        >
          {mineOnly ? '只看我的' : '所有考試'}
        </button>

        <div className="flex items-center gap-2">
          <label htmlFor="created-start" className="text-sm font-medium text-muted-foreground whitespace-nowrap">
            建立時間：
          </label>
          <input
            id="created-start"
            type="date"
            value={createdStart}
            onChange={(e) => setCreatedStart(e.target.value)}
            className="rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <span className="text-muted-foreground">～</span>
          <input
            id="created-end"
            type="date"
            value={createdEnd}
            onChange={(e) => setCreatedEnd(e.target.value)}
            className="rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="score-gte" className="text-sm font-medium text-muted-foreground whitespace-nowrap">
            答對率 (%)：
          </label>
          <input
            id="score-gte"
            type="number"
            min="0"
            max="100"
            placeholder="最小"
            value={scoreGte}
            onChange={(e) => setScoreGte(e.target.value)}
            className="w-20 rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <span className="text-muted-foreground">～</span>
          <input
            id="score-lte"
            type="number"
            min="0"
            max="100"
            placeholder="最大"
            value={scoreLte}
            onChange={(e) => setScoreLte(e.target.value)}
            className="w-20 rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <button
          id="reset-filters"
          type="button"
          onClick={resetFilters}
          title="重設篩選"
          className="ml-auto rounded-md p-1.5 border border-input bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
      </div>

      {/* 批量操作工具列 */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg border bg-primary/5 text-sm">
          <span className="font-medium">
            已選取 <span className="text-primary">{selectedIds.size}</span> 場考試
          </span>
          <div className="h-4 w-px bg-border" />
          <Button
            size="sm"
            variant="default"
            onClick={handleBatchPublish}
            disabled={bulkLoading}
          >
            {bulkLoading ? '處理中…' : '發布考試'}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleBatchDelete}
            disabled={bulkLoading}
          >
            {bulkLoading ? '處理中…' : '刪除考試'}
          </Button>
          {bulkError && (
            <span className="text-destructive text-xs">{bulkError}</span>
          )}
        </div>
      )}

      {/* 考試列表 */}
      {filteredExams.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">目前沒有考試</p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium">考試標題</th>
                <th className="px-4 py-3 text-left font-medium w-36">標籤</th>
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
                  className={`border-t hover:bg-muted/30 transition-colors ${
                    selectedIds.has(exam.id) ? 'bg-primary/5' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(exam.id)}
                      onChange={() => toggleSelect(exam.id)}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium">{exam.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">{exam.tag || '—'}</td>
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
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/interviewer/exams/${exam.id}`}>查看</Link>
                      </Button>
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