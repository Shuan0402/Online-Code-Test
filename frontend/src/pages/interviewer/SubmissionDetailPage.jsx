import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import MarkdownView from '@/components/MarkdownView'

import api from '@/lib/api'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import JudgeStatusBadge from '@/components/JudgeStatusBadge'
import { Button } from '@/components/ui/button'

// 難度中文對照
const DIFFICULTY_LABELS = {
  Easy: '簡單',
  Medium: '中等',
  Hard: '困難',
}

const DIFFICULTY_COLORS = {
  Easy: 'bg-green-100 text-green-800',
  Medium: 'bg-yellow-100 text-yellow-800',
  Hard: 'bg-red-100 text-red-800',
}

// 語言顯示名稱
const LANGUAGE_LABELS = {
  python: 'Python',
  cpp: 'C++',
}

export default function SubmissionDetailPage() {
  const { examId, problemId } = useParams()

  // 頁面狀態
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // 考試資料（用於取得 candidate_id 和考試標題）
  const [exam, setExam] = useState(null)

  // 題目資料
  const [problem, setProblem] = useState(null)

  // 提交資料
  const [submission, setSubmission] = useState(null)
  // 候選人尚未提交此題
  const [notSubmitted, setNotSubmitted] = useState(false)

  // 考生帳號（用 candidate_id 另查 users 取得 username）
  const [candidate, setCandidate] = useState(null)

  // 原始碼
  const [sourceCode, setSourceCode] = useState(null)
  // presigned_url 為 null 或無法取得時
  const [sourceUnavailable, setSourceUnavailable] = useState(false)

  useEffect(() => {
    // problem_id 從 URL param 是字串，必須轉為 Number（lesson L1 applied to query strings）
    const problemIdNum = Number(problemId)

    async function loadAll() {
      setLoading(true)
      setError(null)
      setNotSubmitted(false)
      setSourceUnavailable(false)

      try {
        // 步驟 1：取得考試詳情以獲得 candidate_id 和考試標題
        const examRes = await api.get(`/api/v1/exams/${examId}`)
        const examData = examRes.data
        setExam(examData)

        const candidateId = examData.candidate_id

        // 步驟 2：查詢此考試、此題目、此考生的提交列表（newest-first）
        const submissionsRes = await api.get('/api/v1/submissions/', {
          params: {
            exam_id: examId,
            problem_id: problemIdNum, // 必須是 Number，不可送字串
            user_id: candidateId,
          },
        })

        const submissions = submissionsRes.data ?? []

        // 若提交列表為空，考生尚未提交此題，停止後續 API 呼叫
        if (submissions.length === 0) {
          setNotSubmitted(true)
          setLoading(false)
          return
        }

        // 取最新提交（index 0，後端回傳 newest-first）
        const latestSubmissionId = submissions[0].id

        // 步驟 3+4+5：平行取得完整提交資料、題目詳情、考生帳號
        // 考生帳號查詢失敗時不影響整頁，fallback 為 candidate_id
        const [submissionRes, problemRes, candidateRes] = await Promise.all([
          api.get(`/api/v1/submissions/${latestSubmissionId}`),
          api.get(`/api/v1/problems/${problemIdNum}`),
          api.get(`/api/v1/users/${candidateId}`).catch(() => ({ data: null })),
        ])

        const submissionData = submissionRes.data
        const problemData = problemRes.data

        setSubmission(submissionData)
        setProblem(problemData)
        setCandidate(candidateRes.data)

        // 步驟 5：若 presigned_url 不為 null，用 plain fetch() 取得原始碼
        if (submissionData.presigned_url === null) {
          // presigned_url 為 null 時，顯示「程式碼暫無法顯示」
          setSourceUnavailable(true)
        } else {
          try {
            // S3 presigned URL — must use plain fetch(), NOT api axios instance
            // （api 會補 /api 前綴且附上 Bearer token，對 S3 URL 兩者皆錯）
            const sourceRes = await globalThis.fetch(submissionData.presigned_url)
            const text = await sourceRes.text()
            setSourceCode(text)
          } catch {
            // S3 請求失敗時，gracefully 顯示「程式碼暫無法顯示」
            setSourceUnavailable(true)
          }
        }
      } catch (err) {
        setError(err.response?.data?.detail ?? '載入提交資料失敗，請稍後再試')
      } finally {
        setLoading(false)
      }
    }

    loadAll()
  }, [examId, problemId])

  // --- 渲染：載入中 ---
  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  // --- 渲染：載入失敗 ---
  if (error) {
    return (
      <div className="p-6">
        <ErrorMessage message={error} />
        <div className="mt-4">
          <Button variant="outline" asChild>
            <Link to={`/interviewer/exams/${examId}`}>← 返回考試詳情</Link>
          </Button>
        </div>
      </div>
    )
  }

  // --- 渲染：考生尚未提交此題 ---
  if (notSubmitted) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Button variant="outline" size="sm" asChild>
          <Link to={`/interviewer/exams/${examId}`}>← 返回考試詳情</Link>
        </Button>
        {exam && (
          <h1 className="text-xl font-semibold">{exam.title}</h1>
        )}
        <p className="text-muted-foreground">考生尚未提交此題</p>
      </div>
    )
  }

  const candidateDisplay = candidate?.username ?? exam?.candidate_id ?? '—'

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* 頁首：返回連結 + 考試標題 + 考生帳號 */}
      <div className="space-y-1">
        <Button variant="outline" size="sm" asChild>
          <Link to={`/interviewer/exams/${examId}`}>← 返回考試詳情</Link>
        </Button>
        {exam && (
          <div className="flex items-center gap-2 mt-2">
            <h1 className="text-2xl font-semibold">{exam.title}</h1>
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          考生帳號：{candidateDisplay}
        </p>
      </div>

      {/* 題目資訊 */}
      {problem && (
        <section className="rounded-lg border p-4 space-y-3">
          <h2 className="text-base font-semibold">題目資訊</h2>
          <div className="flex items-center gap-3">
            <span className="font-medium">{problem.title}</span>
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                DIFFICULTY_COLORS[problem.difficulty] ?? 'bg-gray-100 text-gray-700'
              }`}
            >
              {DIFFICULTY_LABELS[problem.difficulty] ?? problem.difficulty}
            </span>
          </div>
          {problem.description && (
            <MarkdownView className="text-sm text-muted-foreground">
              {problem.description}
            </MarkdownView>
          )}
        </section>
      )}

      {/* 提交資訊 */}
      {submission && (
        <section className="rounded-lg border p-4 space-y-3">
          <h2 className="text-base font-semibold">提交資訊</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">語言：</span>
              <span>{LANGUAGE_LABELS[submission.language] ?? submission.language}</span>
            </div>
            <div>
              <span className="text-muted-foreground">狀態：</span>
              <JudgeStatusBadge status={submission.status} />
            </div>
            <div>
              <span className="text-muted-foreground">分數：</span>
              <span>{submission.score ?? '—'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">執行時間：</span>
              <span>
                {submission.execution_time != null
                  ? `${submission.execution_time} ms`
                  : '—'}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* 程式碼 */}
      <section className="rounded-lg border overflow-hidden">
        <div className="px-4 py-3 bg-muted">
          <h2 className="text-base font-semibold">提交程式碼</h2>
        </div>
        {sourceUnavailable ? (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">程式碼暫無法顯示</p>
        ) : sourceCode !== null ? (
          <pre className="bg-muted rounded p-4 text-sm overflow-auto whitespace-pre-wrap break-words">
            {sourceCode}
          </pre>
        ) : (
          <div className="flex justify-center py-6">
            <LoadingSpinner />
          </div>
        )}
      </section>

      {/* 測資結果 */}
      {submission && (
        <section className="rounded-lg border overflow-hidden">
          <div className="px-4 py-3 bg-muted">
            <h2 className="text-base font-semibold">測資結果</h2>
          </div>
          {!submission.details || submission.details.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">
              尚無測資結果
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium w-20">測資編號</th>
                  <th className="px-4 py-3 text-left font-medium w-28">狀態</th>
                  <th className="px-4 py-3 text-left font-medium w-16">得分</th>
                  <th className="px-4 py-3 text-left font-medium w-28">執行時間</th>
                  <th className="px-4 py-3 text-left font-medium">詳細資訊</th>
                </tr>
              </thead>
              <tbody>
                {submission.details.map((detail) => (
                  <tr
                    key={detail.id}
                    className="border-t hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-muted-foreground">{detail.testcase_id}</td>
                    <td className="px-4 py-3">
                      <JudgeStatusBadge status={detail.status} />
                    </td>
                    <td className="px-4 py-3">{detail.score}</td>
                    <td className="px-4 py-3">
                      {detail.execution_time != null
                        ? `${detail.execution_time} ms`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {detail.runtime_info ? (
                        <pre className="text-xs whitespace-pre-wrap break-all bg-muted/20 rounded px-2 py-1 max-h-24 overflow-y-auto">
                          {detail.runtime_info}
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
            <div className="px-4 py-3 border-t bg-muted/5">
              <p className="text-xs font-medium text-muted-foreground mb-1">整體錯誤訊息摘要：</p>
              <pre className="text-xs whitespace-pre-wrap break-all bg-muted/20 rounded px-2 py-1 max-h-40 overflow-y-auto">
                {submission.judge_log}
              </pre>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
