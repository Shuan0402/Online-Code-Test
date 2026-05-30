import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import api from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import LoadingSpinner from '@/components/LoadingSpinner'

const DIFFICULTY_MAP = {
  Easy:   { label: '簡單', className: 'bg-green-100 text-green-800' },
  Medium: { label: '中等', className: 'bg-yellow-100 text-yellow-800' },
  Hard:   { label: '困難', className: 'bg-red-100 text-red-800' },
}

/**
 * ProblemPanel
 *
 * 左側題目敘述面板。
 * - 從 GET /api/v1/problems/{problemId} 取得詳細內容。
 * - 後端對 Candidate 角色只回傳 is_sample=true 的測試案例，直接渲染。
 *
 * @param {number} problemId   — 題目 ID
 * @param {number} points      — 本題在此考試的配分
 * @param {number} sequence    — 題號
 */
export default function ProblemPanel({ problemId, points, sequence }) {
  const [problem, setProblem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!problemId) return
    let cancelled = false

    setLoading(true)
    setError(null)
    setProblem(null)

    api.get(`/api/v1/problems/${problemId}`)
      .then((res) => {
        if (!cancelled) setProblem(res.data)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.response?.data?.detail || '無法載入題目資料，請稍後再試。')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [problemId])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
        <LoadingSpinner />
        <span className="text-sm">載入題目中…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-red-600">
        <p className="font-semibold">載入失敗</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    )
  }

  if (!problem) return null

  const diff = DIFFICULTY_MAP[problem.difficulty] ?? { label: problem.difficulty, className: '' }

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      {/* 題目標題列 */}
      <div className="flex items-start gap-2 flex-wrap">
        <span className="text-muted-foreground text-sm font-medium">題 {sequence}．</span>
        <h2 className="text-lg font-bold leading-tight">{problem.title}</h2>
        <Badge className={diff.className}>{diff.label}</Badge>
        <Badge variant="outline" className="ml-auto shrink-0">{points} 分</Badge>
      </div>

      {/* 時間 / 記憶體限制 */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>時間限制：{problem.time_limit_ms} ms</span>
        <span>記憶體限制：{problem.memory_limit_mb} MB</span>
      </div>

      {/* 題目描述（Markdown 渲染） */}
      <div className="text-sm leading-relaxed border rounded p-3 bg-muted/30 prose prose-sm max-w-none">
        <ReactMarkdown>{problem.description}</ReactMarkdown>
      </div>

      {/* 範例測試案例 */}
      {problem.test_cases && problem.test_cases.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold">範例測資</p>
          {problem.test_cases.map((tc, i) => (
            <div key={tc.id} className="text-xs border rounded overflow-hidden">
              <div className="grid grid-cols-2">
                <div className="bg-muted/50 p-2">
                  <p className="font-medium mb-1 text-muted-foreground">輸入 {i + 1}</p>
                  <pre className="whitespace-pre-wrap font-mono">{tc.input_data}</pre>
                </div>
                <div className="bg-muted/30 p-2 border-l">
                  <p className="font-medium mb-1 text-muted-foreground">輸出 {i + 1}</p>
                  <pre className="whitespace-pre-wrap font-mono">{tc.expected_output}</pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
