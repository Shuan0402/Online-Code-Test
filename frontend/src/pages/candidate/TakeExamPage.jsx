import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '@/lib/api'

import ExamTimer from '@/components/ExamTimer'
import ProblemPanel from '@/components/ProblemPanel'
import EditorPanel from '@/components/EditorPanel'
import FinalizeModal from './FinalizeModal'
import LoadingSpinner from '@/components/LoadingSpinner'
import { Button } from '@/components/ui/button'
import { useAdaptivePolling } from '@/hooks/useAdaptivePolling'
import { useOfflineRecovery } from '@/hooks/useOfflineRecovery'

// ── 評測狀態標籤與顏色 ───────────────────────────────────────────────────────
const STATUS_LABEL = {
  Pending:     '評判中',
  Judging:     '評判中',
  AC:          'AC',
  WA:          'WA',
  TLE:         'TLE',
  MLE:         'MLE',
  RE:          'RE',
  CE:          'CE',
  Unsubmitted: '未提交',
}
const STATUS_VARIANT = {
  AC:          'bg-green-500 text-white',
  WA:          'bg-red-500 text-white',
  TLE:         'bg-orange-500 text-white',
  MLE:         'bg-orange-400 text-white',
  RE:          'bg-red-400 text-white',
  CE:          'bg-yellow-500 text-white',
  Pending:     'bg-blue-400 text-white',
  Judging:     'bg-blue-500 text-white animate-pulse',
  Unsubmitted: 'bg-gray-200 text-gray-600',
}

// ── 內部 hook：為單一題目掛 adaptive polling ──────────────────────────────────
/**
 * 這個元件只是用來讓我們能在一個迴圈外呼叫 useAdaptivePolling。
 * 實際上 TakeExamPage 透過 pollingMap state 管理每題的 submissionId，
 * 並把結果寫回 statuses state。
 */

export default function TakeExamPage() {
  const { id: examId } = useParams()
  const navigate = useNavigate()

  // ── 考試資料 ────────────────────────────────────────────────────────────────
  const [exam, setExam] = useState(null)
  const [remainingSeconds, setRemainingSeconds] = useState(null)
  const [loadError, setLoadError] = useState(null)

  // ── 題目選擇 ────────────────────────────────────────────────────────────────
  const [activeIdx, setActiveIdx] = useState(0)
  // ref to the active EditorPanel instance so we can flush draft before tab switch
  const editorRef = useRef(null)

  // ── 評測狀態：{ [problemId]: statusStr } ────────────────────────────────────
  const [statuses, setStatuses] = useState({})

  // ── 輪詢管理：{ [problemId]: submissionId | null } ───────────────────────────
  const [pollingIds, setPollingIds] = useState({}) // problemId → submissionId

  // ── 提交進行中 flag（per problem） ───────────────────────────────────────────
  const [submittingPids, setSubmittingPids] = useState({})

  // ── 交卷 Modal ───────────────────────────────────────────────────────────────
  const [showFinalize, setShowFinalize] = useState(false)
  const [isTimeout, setIsTimeout] = useState(false)

  // ── 提交錯誤（inline，取代 alert()） ─────────────────────────────────────────
  const [submitError, setSubmitError] = useState(null) // { problemId, message }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. 掛載時呼叫 POST /api/v1/exams/{examId}/start（idempotent）
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!examId) return

    api.post(`/api/v1/exams/${examId}/start`)
      .then((res) => {
        setExam(res.data)
        setRemainingSeconds(res.data.remaining_seconds ?? 0)
      })
      .catch((err) => {
        const status = err?.response?.status
        const detail = err?.response?.data?.detail ?? ''
        // 400 代表時間截止或已完成 → 導向結果頁
        if (status === 400) {
          navigate(`/candidate/exams/${examId}/result`, { replace: true })
        } else {
          setLoadError(detail || '無法載入考試，請稍後再試。')
        }
      })
  }, [examId, navigate])

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. 冷重啟恢復（useOfflineRecovery）
  // ─────────────────────────────────────────────────────────────────────────────
  const handlePendingFound = useCallback((problemId, submissionId) => {
    setPollingIds((prev) => ({ ...prev, [problemId]: submissionId }))
    setStatuses((prev) => ({ ...prev, [problemId]: 'Pending' }))
  }, [])

  useOfflineRecovery(
    exam?.exam_problems ?? [],
    examId,
    exam?.status ?? '',
    handlePendingFound
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Adaptive polling for each active problem
  //    We use a single active problem approach: poll whatever is in pollingIds.
  //    We need one polling hook per problem slot but we don't know count upfront.
  //    Solution: we track up to N problems (max 10 for typical exams).
  //    Use a flat registry approach — store submissionId per problem slot.
  // ─────────────────────────────────────────────────────────────────────────────

  // 輪詢回呼：更新評測狀態，若終止就清 pending key
  const handlePollResult = useCallback((problemId) => (data) => {
    setStatuses((prev) => ({ ...prev, [problemId]: data.status }))
    const terminal = data.status !== 'Pending' && data.status !== 'Judging'
    if (terminal) {
      localStorage.removeItem(`pending:${problemId}`)
      setPollingIds((prev) => ({ ...prev, [problemId]: null }))
    }
  }, [])

  // ─────────────────────────────────────────────────────────────────────────────
  // PollingSlot — small inner component so we can call useAdaptivePolling
  // legally (hooks must be in components, not called conditionally in loops)
  // ─────────────────────────────────────────────────────────────────────────────

  // We render a hidden PollingSlot per problem that internally calls the hook.
  // The slot receives submissionId and calls onResult when done.

  // ─────────────────────────────────────────────────────────────────────────────
  // 3b. Tab switch — flush draft synchronously BEFORE changing active index
  // ─────────────────────────────────────────────────────────────────────────────
  const handleTabSwitch = useCallback((idx) => {
    // Flush pending debounce so the latest keystrokes are not lost
    editorRef.current?.flushDraft()
    setActiveIdx(idx)
  }, [])

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. 提交程式碼
  // ─────────────────────────────────────────────────────────────────────────────
  const handleSubmit = async (problemId, code, language) => {
    setSubmittingPids((prev) => ({ ...prev, [problemId]: true }))
    // 清除此題的舊提交錯誤
    setSubmitError(null)
    try {
      const res = await api.post('/api/v1/submissions/', {
        problem_id: problemId,
        exam_id: examId,
        language,
        source_code: code,
        submission_type: 'OFFICIAL',
      })
      // 只要 2xx 都算成功
      const submissionId = res.data.id
      // 寫 pending key
      localStorage.setItem(`pending:${problemId}`, JSON.stringify({ submissionId, ts: Date.now() }))
      // 啟動輪詢
      setStatuses((prev) => ({ ...prev, [problemId]: 'Pending' }))
      setPollingIds((prev) => ({ ...prev, [problemId]: submissionId }))
    } catch (err) {
      console.error('[TakeExamPage] 提交失敗', err?.response?.data)
      const message = err?.response?.data?.detail || '提交失敗，請稍後再試。'
      setSubmitError({ problemId, message })
    } finally {
      setSubmittingPids((prev) => ({ ...prev, [problemId]: false }))
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. 計時器歸零 → 自動交卷
  // ─────────────────────────────────────────────────────────────────────────────
  const handleTimeout = useCallback(() => {
    setIsTimeout(true)
    setShowFinalize(true)
  }, [])

  // ─────────────────────────────────────────────────────────────────────────────
  // 載入中 / 錯誤狀態
  // ─────────────────────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <p className="text-red-600 text-center">{loadError}</p>
        <Button variant="outline" onClick={() => navigate('/candidate/exams')}>
          返回考試列表
        </Button>
      </div>
    )
  }

  if (!exam) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <LoadingSpinner />
        <span className="text-sm">載入考試資料中…</span>
      </div>
    )
  }

  const problems = exam.exam_problems ?? []
  const activeProblem = problems[activeIdx]

  return (
    <div className="flex flex-col h-full">
      {/* ── 頂部資訊列 ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-4 py-2 border-b bg-background shrink-0 flex-wrap">
        <span className="font-semibold text-sm">{exam.title}</span>

        <div className="flex-1" />

        <ExamTimer
          initialSeconds={remainingSeconds}
          onTimeout={handleTimeout}
        />

        <Button
          size="sm"
          variant="destructive"
          onClick={() => { setIsTimeout(false); setShowFinalize(true) }}
        >
          交卷
        </Button>
      </div>

      {/* ── 題目 Tab 列 ───────────────────────────────────────────────────── */}
      <div className="flex gap-1 px-3 pt-2 pb-0 border-b bg-muted/20 shrink-0 overflow-x-auto">
        {problems.map((p, idx) => {
          const st = statuses[p.problem_id] ?? 'Unsubmitted'
          const isActive = idx === activeIdx
          return (
            <button
              key={p.problem_id}
              data-problem-id={p.problem_id}
              onClick={() => handleTabSwitch(idx)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-t border-b-2 transition-colors ${
                isActive
                  ? 'border-primary font-medium bg-background'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              題 {p.sequence}
              <span
                className={`inline-flex items-center rounded px-1 text-xs font-medium ${STATUS_VARIANT[st] ?? STATUS_VARIANT.Unsubmitted}`}
              >
                {STATUS_LABEL[st] ?? st}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── 提交錯誤 banner（inline，取代原本的 alert()） ────────────────── */}
      {submitError && activeProblem && submitError.problemId === activeProblem.problem_id && (
        <div className="flex items-center justify-between gap-3 bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-600 shrink-0">
          <span>{submitError.message}</span>
          <button
            className="text-red-400 hover:text-red-600 font-medium shrink-0"
            onClick={() => setSubmitError(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── 主體：題目說明 + 編輯器 ─────────────────────────────────────────── */}
      {activeProblem ? (
        <div className="flex flex-1 min-h-0">
          {/* 左：題目敘述 */}
          <div className="w-2/5 border-r overflow-hidden">
            <ProblemPanel
              problemId={activeProblem.problem_id}
              points={activeProblem.points}
              sequence={activeProblem.sequence}
            />
          </div>

          {/* 右：編輯器 */}
          <div className="flex-1 min-w-0">
            <EditorPanel
              ref={editorRef}
              examId={examId}
              problemId={activeProblem.problem_id}
              onSubmit={(code, lang) => handleSubmit(activeProblem.problem_id, code, lang)}
              submitting={!!submittingPids[activeProblem.problem_id]}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center flex-1 text-muted-foreground">
          此考試目前沒有題目。
        </div>
      )}

      {/* ── Polling slots（每道題目一個，合法呼叫 hooks） ─────────────────── */}
      {problems.map((p) => (
        <PollingSlot
          key={p.problem_id}
          problemId={p.problem_id}
          submissionId={pollingIds[p.problem_id] ?? null}
          onResult={handlePollResult(p.problem_id)}
        />
      ))}

      {/* ── 交卷 Modal ─────────────────────────────────────────────────────── */}
      <FinalizeModal
        open={showFinalize}
        isTimeout={isTimeout}
        problems={problems}
        statuses={statuses}
        examId={examId}
        onClose={() => setShowFinalize(false)}
        onDone={() => navigate(`/candidate/exams/${examId}/result`)}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PollingSlot — renders nothing; only calls useAdaptivePolling as a hook anchor
// ─────────────────────────────────────────────────────────────────────────────
function PollingSlot({ submissionId, onResult }) {
  useAdaptivePolling(submissionId, onResult)
  return null
}
