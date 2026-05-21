import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

import api from '@/lib/api'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import JudgeStatusBadge from '@/components/JudgeStatusBadge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * 格式化日期時間為可讀字串
 * e.g. "2026-05-21T10:00:00Z" → "2026/05/21 10:00:05"
 */
function formatDateTime(isoString) {
  if (!isoString) return '—'
  const d = new Date(isoString)
  if (isNaN(d.getTime())) return isoString
  return d.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/**
 * ProblemSubmissionsPage — 該題提交紀錄查看頁
 *
 * 路由：/questioner/problems/:id/submissions
 * 從 URL 取得 problem id，載入該題目所有提交紀錄，
 * 點擊「查看詳情」開啟 Dialog 顯示 judge_log 與逐測資的 details。
 */
export default function ProblemSubmissionsPage() {
  const { id } = useParams()           // problem id（字串）
  const navigate = useNavigate()

  // 提交列表狀態
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // 詳情 Dialog 狀態
  const [dialogOpen, setDialogOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(null)
  const [selectedSubmission, setSelectedSubmission] = useState(null)

  // 載入提交列表
  const fetchSubmissions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/api/v1/submissions/?problem_id=${id}`)
      setSubmissions(res.data)
    } catch (err) {
      setError('載入提交紀錄失敗，請稍後再試。')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchSubmissions()
  }, [fetchSubmissions])

  // 點擊「查看詳情」— 取得單筆詳情並開啟 Dialog
  async function handleViewDetail(submissionId) {
    setDialogOpen(true)
    setDetailLoading(true)
    setDetailError(null)
    setSelectedSubmission(null)
    try {
      const res = await api.get(`/api/v1/submissions/${submissionId}`)
      setSelectedSubmission(res.data)
    } catch (err) {
      setDetailError('載入詳情失敗，請稍後再試。')
    } finally {
      setDetailLoading(false)
    }
  }

  // ── 主體渲染 ──────────────────────────────────────────────

  return (
    <div className="p-6 space-y-4">
      {/* 頁首 */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate('/questioner/problems')}>
          ← 返回
        </Button>
        <h1 className="text-xl font-semibold">提交紀錄（題目 #{id}）</h1>
      </div>

      {/* 載入中 */}
      {loading && (
        <div className="flex justify-center py-16">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {/* 載入失敗 */}
      {!loading && error && (
        <ErrorMessage message={error} onRetry={fetchSubmissions} />
      )}

      {/* 空列表 */}
      {!loading && !error && submissions.length === 0 && (
        <p className="text-center text-muted-foreground py-16">尚無提交紀錄</p>
      )}

      {/* 提交列表表格 */}
      {!loading && !error && submissions.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">提交者</th>
                <th className="px-4 py-3 text-left font-medium">狀態</th>
                <th className="px-4 py-3 text-right font-medium">分數</th>
                <th className="px-4 py-3 text-right font-medium">執行時間</th>
                <th className="px-4 py-3 text-left font-medium">提交時間</th>
                <th className="px-4 py-3 text-center font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {submissions.map((sub) => (
                <tr key={sub.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">{sub.user_id}</td>
                  <td className="px-4 py-3">
                    <JudgeStatusBadge status={sub.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {sub.score != null ? sub.score : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {sub.execution_time != null ? `${sub.execution_time} ms` : '—'}
                  </td>
                  <td className="px-4 py-3">{formatDateTime(sub.created_at)}</td>
                  <td className="px-4 py-3 text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewDetail(sub.id)}
                    >
                      查看詳情
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 詳情 Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>提交詳情</DialogTitle>
          </DialogHeader>

          {/* Dialog 內部載入中 */}
          {detailLoading && (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          )}

          {/* Dialog 內部錯誤 */}
          {!detailLoading && detailError && (
            <ErrorMessage message={detailError} />
          )}

          {/* Dialog 詳情內容 */}
          {!detailLoading && !detailError && selectedSubmission && (
            <div className="space-y-4">
              {/* 評測狀態 */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground font-medium">狀態：</span>
                <JudgeStatusBadge status={selectedSubmission.status} />
              </div>

              {/* 分數 */}
              <div className="text-sm">
                <span className="text-muted-foreground font-medium">分數：</span>
                {selectedSubmission.score != null ? selectedSubmission.score : '—'}
              </div>

              {/* judge_log */}
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground font-medium">評測日誌：</p>
                {selectedSubmission.judge_log ? (
                  <pre className="rounded bg-muted p-3 text-xs whitespace-pre-wrap break-words overflow-x-auto">
                    {selectedSubmission.judge_log}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground">無</p>
                )}
              </div>

              {/* 測試資料詳情 */}
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground font-medium">測資詳情：</p>
                {!selectedSubmission.details || selectedSubmission.details.length === 0 ? (
                  <p className="text-sm text-muted-foreground">無詳細測試資料</p>
                ) : (
                  <div className="overflow-x-auto rounded border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">#</th>
                          <th className="px-3 py-2 text-left font-medium">狀態</th>
                          <th className="px-3 py-2 text-right font-medium">執行時間</th>
                          <th className="px-3 py-2 text-right font-medium">記憶體</th>
                          <th className="px-3 py-2 text-right font-medium">分數</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {selectedSubmission.details.map((detail, idx) => (
                          <tr key={detail.id ?? idx}>
                            <td className="px-3 py-2">{idx + 1}</td>
                            <td className="px-3 py-2">
                              <JudgeStatusBadge status={detail.status} />
                            </td>
                            <td className="px-3 py-2 text-right">
                              {detail.execution_time != null ? `${detail.execution_time} ms` : '—'}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {detail.memory_usage != null ? `${detail.memory_usage} MB` : '—'}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {detail.score != null ? detail.score : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
