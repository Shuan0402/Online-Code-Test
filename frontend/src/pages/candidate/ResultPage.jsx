import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '@/lib/api'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import JudgeStatusBadge from '@/components/JudgeStatusBadge'
import { Button } from '@/components/ui/button'

/**
 * ResultPage — 考試結果頁
 *
 * 路由：/candidate/exams/:id/result
 *
 * 主表：GET /api/v1/exams/{id}/result → ExamResultRead
 *   { id, title, total_exam_points, total_candidate_score,
 *     results: [{ problem_id, title, sequence, max_points, candidate_score, submission_status }] }
 *
 * 點開每題明細：GET /api/v1/submissions/latest?problem_id=X&exam_id=Y → SubmissionRead
 *   含 details: [{ testcase_id, status, execution_time, memory_usage, score, runtime_info }]
 */
export default function ResultPage() {
  const { id: examId } = useParams()
  const navigate = useNavigate()

  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // 每題的展開狀態與明細快取
  const [expanded, setExpanded] = useState({})
  const [details, setDetails] = useState({})

  const fetchResult = useCallback(() => {
    setLoading(true)
    setError(null)

    api.get(`/api/v1/exams/${examId}/result`)
      .then((res) => setResult(res.data))
      .catch((err) => setError(err?.response?.data?.detail || '無法載入考試結果，請稍後再試。'))
      .finally(() => setLoading(false))
  }, [examId])

  useEffect(() => {
    fetchResult()
  }, [fetchResult])

  // 後備清 draft：自動 timeout 交卷 / 直接打 url 進 ResultPage 都會走到這裡。
  // FinalizeModal 在 handleConfirm 已清過、這條是 belt-and-suspenders。
  useEffect(() => {
    if (!examId) return
    const prefix = `draft:exam:${examId}:problem:`
    Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
      .forEach((k) => localStorage.removeItem(k))
  }, [examId])

  const toggleRow = (problemId) => {
    setExpanded((prev) => ({ ...prev, [problemId]: !prev[problemId] }))

    // 第一次展開才打 API；之後切換不重打
    if (!details[problemId]) {
      setDetails((prev) => ({ ...prev, [problemId]: { loading: true } }))
      api.get('/api/v1/submissions/latest', { params: { problem_id: problemId, exam_id: examId } })
        .then((res) => setDetails((prev) => ({ ...prev, [problemId]: { data: res.data } })))
        .catch((err) => {
          const noSubmission = err?.response?.status === 404
          setDetails((prev) => ({
            ...prev,
            [problemId]: { error: noSubmission ? '尚未提交本題' : '無法載入明細' },
          }))
        })
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">考試結果</h1>
        <Button variant="outline" onClick={() => navigate('/candidate/exams')}>
          返回考試列表
        </Button>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      )}

      {!loading && error && (
        <ErrorMessage message={error} onRetry={fetchResult} />
      )}

      {!loading && !error && result && (
        <div className="space-y-6">
          {/* 考試標題與「答對 X / 共 Y 題」摘要
              spec：candidate 只看答對題數、不看分數 */}
          <div className="rounded-lg border bg-white shadow-sm p-5">
            <h2 className="text-lg font-bold mb-2">{result.title}</h2>
            <p className="text-3xl font-semibold text-primary">
              答對 {result.results.filter((r) => r.submission_status === 'AC').length}
              <span className="text-base text-muted-foreground font-normal">
                {' '}/ 共 {result.results.length} 題
              </span>
            </p>
          </div>

          {/* 每題明細 */}
          <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground w-16">題號</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">題目</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground w-28">狀態</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground w-24">結果</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground w-20">明細</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {result.results.map((item) => {
                  const isOpen = !!expanded[item.problem_id]
                  return (
                    <FragmentRow
                      key={item.problem_id}
                      item={item}
                      isOpen={isOpen}
                      detailState={details[item.problem_id]}
                      onToggle={() => toggleRow(item.problem_id)}
                    />
                  )
                })}
              </tbody>
            </table>

            {result.results.length === 0 && (
              <p className="text-center text-muted-foreground py-8">此次考試沒有題目記錄。</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function FragmentRow({ item, isOpen, detailState, onToggle }) {
  return (
    <>
      <tr className="hover:bg-muted/10 transition-colors">
        <td className="px-4 py-3 text-muted-foreground">{item.sequence}</td>
        <td className="px-4 py-3 font-medium">{item.title}</td>
        <td className="px-4 py-3">
          <JudgeStatusBadge status={item.submission_status} />
        </td>
        <td className="px-4 py-3 text-right">
          {/* spec：candidate 只看「已答對 / 未答對」、不看分數數字 */}
          {item.submission_status === 'AC' ? '已答對' : '未答對'}
        </td>
        <td className="px-4 py-3 text-right">
          <button
            type="button"
            onClick={onToggle}
            className="text-xs text-primary hover:underline"
            aria-expanded={isOpen}
            aria-label={isOpen ? '收合明細' : '展開明細'}
          >
            {isOpen ? '收合 ▲' : '展開 ▼'}
          </button>
        </td>
      </tr>
      {isOpen && (
        <tr className="bg-muted/5">
          <td colSpan={5} className="px-4 py-4">
            <TestcaseDetailSection state={detailState} />
          </td>
        </tr>
      )}
    </>
  )
}

function TestcaseDetailSection({ state }) {
  if (!state || state.loading) {
    return (
      <div className="flex justify-center py-4">
        <LoadingSpinner />
      </div>
    )
  }

  if (state.error) {
    return <p className="text-sm text-muted-foreground py-2">{state.error}</p>
  }

  const submission = state.data
  const details = submission?.details ?? []

  return (
    <div className="space-y-3">
      {details.length === 0 ? (
        <p className="text-sm text-muted-foreground">此次提交尚無 testcase 明細。</p>
      ) : (
        <table className="w-full text-xs border bg-white">
          <thead className="bg-muted/30">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-16">Testcase</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-24">結果</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground w-20">耗時</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground w-24">記憶體</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">詳細資訊</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {details.map((d, idx) => (
              <tr key={d.id ?? idx}>
                <td className="px-3 py-2 text-muted-foreground">#{idx + 1}</td>
                <td className="px-3 py-2">
                  <JudgeStatusBadge status={d.status} />
                </td>
                <td className="px-3 py-2 text-right">
                  {d.execution_time != null ? `${d.execution_time} ms` : '—'}
                </td>
                <td className="px-3 py-2 text-right">
                  {d.memory_usage != null ? `${d.memory_usage} MB` : '—'}
                </td>
                <td className="px-3 py-2">
                  {d.runtime_info ? (
                    <pre className="text-xs whitespace-pre-wrap break-all bg-muted/20 rounded px-2 py-1 max-h-32 overflow-y-auto">
                      {d.runtime_info}
                    </pre>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {submission?.judge_log && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">整體錯誤訊息摘要：</p>
          <pre className="text-xs whitespace-pre-wrap break-all bg-muted/20 rounded px-2 py-1 max-h-40 overflow-y-auto">
            {submission.judge_log}
          </pre>
        </div>
      )}
    </div>
  )
}
