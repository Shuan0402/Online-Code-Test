import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'

import api from '@/lib/api'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import ExamStatusBadge from '@/components/ExamStatusBadge'
import JudgeStatusBadge from '@/components/JudgeStatusBadge'
import { Button } from '@/components/ui/button'

export default function ExamResultPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const loadResult = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await api.get(`/api/v1/exams/${id}/result`)
        if (!cancelled) setResult(res.data)
      } catch (err) {
        if (!cancelled)
          setError(err.response?.data?.detail ?? '載入考試結果失敗，請稍後再試')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadResult()
    return () => { cancelled = true }
  }, [id])

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
        <ErrorMessage message={error} />
        <div className="mt-4">
          <Button variant="outline" onClick={() => navigate(`/interviewer/exams/${id}`)}>
            返回考試詳情
          </Button>
        </div>
      </div>
    )
  }

  // total_candidate_score 可能為 null（尚未開始或結束）
  const scoreDisplay =
    result.total_candidate_score != null ? result.total_candidate_score : '—'

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* 頁首 */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link to={`/interviewer/exams/${id}`}>← 返回考試詳情</Link>
        </Button>
        <h1 className="text-2xl font-semibold">{result.title}</h1>
        <ExamStatusBadge status={result.status} />
      </div>

      {/* 總分橫幅 */}
      <div className="rounded-lg border p-6 text-center">
        <p className="text-sm text-muted-foreground mb-1">應試者總分</p>
        <p className="text-4xl font-bold">
          {scoreDisplay}{' '}
          <span className="text-xl font-normal text-muted-foreground">
            / {result.total_exam_points} 分
          </span>
        </p>
      </div>

      {/* 每題結果 */}
      <section>
        <h2 className="text-base font-semibold mb-3">題目結果</h2>
        {result.results.length === 0 ? (
          <p className="text-center text-muted-foreground py-12 text-sm">尚無結果</p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium w-16">題號</th>
                  <th className="px-4 py-3 text-left font-medium">題目名稱</th>
                  <th className="px-4 py-3 text-left font-medium w-24">滿分</th>
                  <th className="px-4 py-3 text-left font-medium w-24">得分</th>
                  <th className="px-4 py-3 text-left font-medium w-28">狀態</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((item) => (
                  <tr
                    key={item.problem_id}
                    className="border-t hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-muted-foreground">{item.sequence}</td>
                    <td className="px-4 py-3 font-medium">{item.title}</td>
                    <td className="px-4 py-3">{item.max_points}</td>
                    <td className="px-4 py-3">
                      {item.candidate_score != null ? item.candidate_score : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <JudgeStatusBadge status={item.submission_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
