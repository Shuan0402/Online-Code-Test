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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"

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
  // ref to SubmissionResultPanel — 提交完成自動滾到 panel、考生不會錯過結果
  const resultPanelRef = useRef(null)

  // ── 評測狀態：{ [problemId]: statusStr } ────────────────────────────────────
  const [statuses, setStatuses] = useState({})

  // ── 最新提交完整結果：{ [problemId]: SubmissionRead } ──────────────────────────
  const [lastResults, setLastResults] = useState({})

  // ── 輪詢管理：{ [problemId]: submissionId | null } ───────────────────────────
  const [pollingIds, setPollingIds] = useState({}) // problemId → submissionId

  // ── 提交進行中 flag（per problem） ───────────────────────────────────────────
  const [submittingPids, setSubmittingPids] = useState({})

  // ── 交卷 Modal ───────────────────────────────────────────────────────────────
  const [showFinalize, setShowFinalize] = useState(false)
  const [isTimeout, setIsTimeout] = useState(false)

  // ── 提交錯誤（inline，取代 alert()） ─────────────────────────────────────────
  const [submitError, setSubmitError] = useState(null) // { problemId, message }

  const [violationType, setViolationType] = useState(null) // 'TAB_SWITCH' | 'LARGE_PASTE'
  const [showViolationModal, setShowViolationModal] = useState(false)

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

  // 瀏覽器事件誠信防線監聽器 ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!exam || exam.status === 'Finished') return

    const reportViolation = async (type, details) => {
      try {
        await api.post(`/api/v1/exams/${examId}/violation`, {
          violation_type: type,
          details: details
        })
        console.log(`違規事件 (${type}) 已成功鎖定上報後端資料庫。`)
      } catch (err) {
        console.error("上報後端失敗：", err)
      }
    }

    const handleVisibilityOrBlur = () => {
      if (document.hidden || !document.hasFocus()) {
        setViolationType('TAB_SWITCH')
        setShowViolationModal(true)
        reportViolation('TAB_SWITCH', '面試者企圖切換標籤頁、使用快捷鍵 Alt+Tab 離開當前考場視窗。')
      }
    }

    const handlePaste = (e) => {
      const pastedText = e.clipboardData.getData('text') || ''

      const lines = pastedText.split('\n').filter(line => line.trim() !== '')
      const lineCount = lines.length

      if (lineCount > 5 || pastedText.length > 100) {
        e.preventDefault()
        e.stopPropagation()

        setViolationType('LARGE_PASTE')
        setShowViolationModal(true)
        setShowViolationModal(true)
        
        reportViolation(
          'LARGE_PASTE', 
          `面試者企圖從外部大量複製貼上代碼。偵測到異常行數: ${lineCount} 行，總字數: ${pastedText.length} 字。`
        )
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityOrBlur, true)
    window.addEventListener('blur', handleVisibilityOrBlur, true)
    document.addEventListener('paste', handlePaste, true)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrBlur, true)
      window.removeEventListener('blur', handleVisibilityOrBlur, true)
      document.removeEventListener('paste', handlePaste, true)
    }
  }, [exam, examId])

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

  // 評測完成 → panel 滾進視窗（smooth）
  const scrollToResultPanel = useCallback(() => {
    requestAnimationFrame(() => {
      resultPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  // 輪詢回呼：更新評測狀態，若終止就清 pending key 並儲存完整結果
  const handlePollResult = useCallback((problemId) => (data) => {
    setStatuses((prev) => ({ ...prev, [problemId]: data.status }))
    const terminal = data.status !== 'Pending' && data.status !== 'Judging'
    if (terminal) {
      localStorage.removeItem(`pending:${problemId}`)
      setPollingIds((prev) => ({ ...prev, [problemId]: null }))
      // 儲存完整 SubmissionRead（含 details.runtime_info）
      setLastResults((prev) => ({ ...prev, [problemId]: data }))
      scrollToResultPanel()
    }
  }, [scrollToResultPanel])

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

      {/* ── 主體 + 結果 panel：在共用 scroll 容器內、panel 永遠在頁面下方 ─── */}
      {activeProblem ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* 上半：題目 + 編輯器，留 ~30% 空間給 panel header 顯示在預設視窗內 */}
          <div className="flex" style={{ height: '70vh', minHeight: '500px' }}>
            {/* 左：題目敘述 (candidate 不秀題目配分) */}
            <div className="w-2/5 border-r overflow-hidden">
              <ProblemPanel
                problemId={activeProblem.problem_id}
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

          {/* 下半：提交 testcase 詳情（全寬、natural 高度，評測完 auto-scroll 到這） */}
          <div ref={resultPanelRef}>
            <SubmissionResultPanel result={lastResults[activeProblem.problem_id]} />
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

      {/* ── 誠信行為違規警告彈窗 (Dialog) ────────────────────────────────────── */}
      <Dialog open={showViolationModal} onOpenChange={setShowViolationModal}>
        <DialogContent className="sm:max-w-[480px] border-red-200 bg-red-50/95 backdrop-blur-md">
          <DialogHeader className="flex flex-col items-center gap-2 text-center">
            <DialogTitle className="text-red-800 text-lg font-bold">
              {violationType === 'TAB_SWITCH' ? '偵測到異常視窗切換行為' : '偵測到非法大量黏貼程式碼'}
            </DialogTitle>
            <DialogDescription className="text-red-700 text-sm mt-1 leading-relaxed">
              {violationType === 'TAB_SWITCH' 
                ? '系統偵測到您剛才離開了當前考試視窗。' 
                : '禁止直接從外部貼上大量程式碼，您剛才的黏貼動作已被攔截。'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 sm:justify-center">
            <Button 
              className="w-full bg-red-600 hover:bg-red-700 text-white font-medium shadow-sm"
              onClick={() => setShowViolationModal(false)}
            >
              我已知曉，承諾誠實應試
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SubmissionResultPanel — 顯示最新一次提交的 testcase 詳情（含 runtime_info）
// ─────────────────────────────────────────────────────────────────────────────
export function SubmissionResultPanel({ result }) {
  // 即使還沒提交，也保留 placeholder、讓考生知道結果會出現在這裡
  if (!result) {
    return (
      <div className="border-t bg-muted/5">
        <p className="px-3 py-2 text-sm font-medium border-b bg-background">
          Testcase 結果
        </p>
        <p className="px-3 py-6 text-sm text-center text-muted-foreground">
          按上方「<span className="font-medium">提交本題</span>」後，testcase 結果會顯示在這。
        </p>
      </div>
    )
  }

  const details = result.details ?? []
  if (details.length === 0) {
    return (
      <div className="border-t bg-muted/5">
        <p className="px-3 py-2 text-sm font-medium border-b bg-background">
          Testcase 結果
        </p>
        <p className="px-3 py-6 text-sm text-center text-muted-foreground">
          評測中…
        </p>
      </div>
    )
  }

  return (
    // panel 放在頁面下半（外層 scroll 容器負責滾動）、自然 expand 把全部 testcase 顯示
    <div className="border-t bg-muted/5">
      <p className="px-3 py-2 text-sm font-medium border-b bg-background flex items-center gap-2">
        最新提交 Testcase 明細
        <span className="ml-auto text-xs text-muted-foreground">共 {details.length} 筆</span>
      </p>
      <table className="w-full text-xs">
        <thead className="bg-muted/20 text-muted-foreground">
          <tr>
            <th className="px-3 py-1.5 text-left font-medium w-16">Testcase</th>
            <th className="px-3 py-1.5 text-left font-medium w-20">結果</th>
            <th className="px-3 py-1.5 text-right font-medium w-20">耗時</th>
            <th className="px-3 py-1.5 text-left font-medium">詳細資訊</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {details.map((d, idx) => (
            <tr key={d.id ?? idx}>
              <td className="px-3 py-1.5 text-muted-foreground">#{idx + 1}</td>
              <td className="px-3 py-1.5">
                <span
                  className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                    STATUS_VARIANT[d.status] ?? STATUS_VARIANT.Unsubmitted
                  }`}
                >
                  {STATUS_LABEL[d.status] ?? d.status}
                </span>
              </td>
              <td className="px-3 py-1.5 text-right">
                {d.execution_time != null ? `${d.execution_time} ms` : '—'}
              </td>
              <td className="px-3 py-1.5">
                {d.runtime_info ? (
                  <pre className="whitespace-pre-wrap break-all bg-muted/30 rounded px-2 py-1 max-h-20 overflow-y-auto text-xs">
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
      {result.failure_reason && (
        <div className="px-3 py-2 border-t">
          <p className="text-xs font-medium text-muted-foreground mb-1">系統錯誤訊息：</p>
          <pre className="text-xs whitespace-pre-wrap break-all bg-muted/20 rounded px-2 py-1 max-h-24 overflow-y-auto">
            {result.failure_reason}
          </pre>
        </div>
      )}
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
