import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'

import api from '@/lib/api'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import CandidateBatchImportDialog from '@/components/CandidateBatchImportDialog'
import { Button } from '@/components/ui/button'

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

export default function CandidateListPage() {
  const navigate = useNavigate()

  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [tagFilter, setTagFilter] = useState('')
  const [existingTags, setExistingTags] = useState([])
  const [batchDialogOpen, setBatchDialogOpen] = useState(false)

  const fetchCandidates = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get('/api/v1/users/')
      // 只顯示 role === 'Candidate' 的帳號
      setCandidates(res.data.filter((u) => u.role === 'Candidate'))
    } catch (err) {
      setError(err.response?.data?.detail ?? '載入考生列表失敗，請稍後再試')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCandidates()
  }, [fetchCandidates])

  useEffect(() => {
    api
      .get('/api/v1/exams/tags')
      .then((res) => {
        setExistingTags(res.data ?? [])
      })
      .catch((err) => {
        console.error('無法載入標籤篩選列表', err)
      })
  }, [])

  const filteredCandidates = tagFilter
    ? candidates.filter((c) => (c.tags ?? []).includes(tagFilter))
    : candidates

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
        <ErrorMessage message={error} onRetry={fetchCandidates} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      {/* 頁首：標題 + 新增按鈕 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">考生管理</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setBatchDialogOpen(true)}>
            批次新增
          </Button>
          <Button onClick={() => navigate('/interviewer/candidates/new')}>
            新增考生
          </Button>
        </div>
      </div>

      <CandidateBatchImportDialog
        open={batchDialogOpen}
        onOpenChange={setBatchDialogOpen}
        onSuccess={fetchCandidates}
      />

      {/* 篩選列 */}
      <div className="flex items-center gap-4 flex-wrap rounded-lg border bg-muted/20 p-3">
        <div className="flex items-center gap-2">
          <label htmlFor="tag-filter" className="text-sm font-medium">
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

        {tagFilter && (
          <button
            type="button"
            onClick={() => setTagFilter('')}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            清除篩選
          </button>
        )}
      </div>

      {/* 考生列表 */}
      {candidates.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">目前沒有考生</p>
      ) : filteredCandidates.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">
          沒有符合此標籤的考生
        </p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">考生姓名</th>
                <th className="px-4 py-3 text-left font-medium">考生帳號</th>
                <th className="px-4 py-3 text-left font-medium">標籤</th>
                <th className="px-4 py-3 text-left font-medium w-44">建立時間</th>
                <th className="px-4 py-3 text-left font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredCandidates.map((candidate) => (
                <tr
                  key={candidate.id}
                  className="border-t hover:bg-muted/30 transition-colors"
                >
                  <td
                    className="px-4 py-3 font-medium max-w-[220px] truncate"
                    title={candidate.full_name ?? candidate.username}
                  >
                    {candidate.full_name ?? candidate.username}
                  </td>
                  <td className="px-4 py-3">{candidate.username}</td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[280px]">
                    {(candidate.tags ?? []).length > 0
                      ? (candidate.tags ?? []).join('、')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDatetime(candidate.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/interviewer/candidates/${candidate.id}`}>查看</Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 說明：刪除操作需由管理員執行 */}
      <p className="text-xs text-muted-foreground">刪除考生帳號需由管理員操作</p>
    </div>
  )
}
