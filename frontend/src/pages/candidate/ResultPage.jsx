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
 * 呼叫 GET /api/v1/exams/{id}/result，
 * 回傳 ExamResultRead：
 *   { id, title, status, total_exam_points, total_candidate_score,
 *     start_time, end_time,
 *     results: [{ problem_id, title, sequence, max_points, candidate_score, submission_status }] }
 *
 * 欄位：題號 / 題目 / 狀態 / 得分
 */
export default function ResultPage() {
  const { id: examId } = useParams()
  const navigate = useNavigate()

  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchResult = useCallback(() => {
    setLoading(true)
    setError(null)

    api.get(`/api/v1/exams/${examId}/result`)
      .then((res) => {
        setResult(res.data)
      })
      .catch((err) => {
        setError(err?.response?.data?.detail || '無法載入考試結果，請稍後再試。')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [examId])

  useEffect(() => {
    fetchResult()
  }, [fetchResult])

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
          {/* 考試標題與總分 */}
          <div className="rounded-lg border bg-white shadow-sm p-5">
            <h2 className="text-lg font-bold mb-2">{result.title}</h2>
            <p className="text-3xl font-semibold text-primary">
              {result.total_candidate_score}
              <span className="text-base text-muted-foreground font-normal">
                {' '}/ {result.total_exam_points} 分
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
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground w-24">得分</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {result.results.map((item) => (
                  <tr key={item.problem_id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground">{item.sequence}</td>
                    <td className="px-4 py-3 font-medium">{item.title}</td>
                    <td className="px-4 py-3">
                      <JudgeStatusBadge status={item.submission_status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.candidate_score} / {item.max_points}
                    </td>
                  </tr>
                ))}
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
