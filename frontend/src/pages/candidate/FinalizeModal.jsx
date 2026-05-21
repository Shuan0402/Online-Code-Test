import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import api from '@/lib/api'

const STATUS_LABEL = {
  Pending: '評判中',
  Judging: '評判中',
  AC: '通過',
  WA: '答案錯誤',
  TLE: '超時',
  MLE: '超出記憶體',
  RE: '執行錯誤',
  CE: '編譯錯誤',
  Unsubmitted: '未提交',
}

const STATUS_COLOR = {
  AC: 'text-green-600',
  WA: 'text-red-600',
  TLE: 'text-orange-500',
  MLE: 'text-orange-500',
  RE: 'text-red-500',
  CE: 'text-yellow-600',
  Pending: 'text-blue-500',
  Judging: 'text-blue-500',
  Unsubmitted: 'text-muted-foreground',
}

/**
 * FinalizeModal
 *
 * @param {boolean}  open          — 是否顯示 modal
 * @param {boolean}  isTimeout     — 是否為時間到自動觸發
 * @param {Array}    problems      — exam_problems 陣列（含 problem_id, title, sequence, points）
 * @param {object}   statuses      — { [problemId]: judgeStatus 字串 }
 * @param {string}   examId        — 考試 UUID
 * @param {function} onClose       — 關閉 modal（非自動模式時可取消）
 * @param {function} onDone        — 交卷完成後呼叫（通常是 navigate 到結果頁）
 */
export default function FinalizeModal({
  open,
  isTimeout,
  problems,
  statuses,
  examId,
  onClose,
  onDone,
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const hasInFlight = problems.some((p) => {
    const s = statuses[p.problem_id]
    return s === 'Pending' || s === 'Judging'
  })

  const handleConfirm = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await api.post(`/api/v1/exams/${examId}/submit`)
      onDone()
    } catch (err) {
      setError(err?.response?.data?.detail || '交卷失敗，請稍後再試。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !isTimeout && !submitting) onClose()
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isTimeout ? '⚠️ 考試時間到，系統將自動交卷' : '確認交卷'}
          </DialogTitle>
          <DialogDescription>
            {isTimeout
              ? '考試時間已截止。系統將代您送出作答成果。'
              : '請確認以下各題狀態後，再點擊「確認交卷」。'}
          </DialogDescription>
        </DialogHeader>

        {/* 各題狀態摘要 */}
        <div className="flex flex-col gap-2 my-2">
          {problems.map((p) => {
            const st = statuses[p.problem_id] ?? 'Unsubmitted'
            const label = STATUS_LABEL[st] ?? st
            const color = STATUS_COLOR[st] ?? ''
            return (
              <div
                key={p.problem_id}
                className="flex justify-between items-center text-sm border-b pb-1"
              >
                <span className="text-muted-foreground">
                  題 {p.sequence}．{p.title}
                </span>
                <span className={`font-medium ${color}`}>{label}</span>
              </div>
            )
          })}
        </div>

        {error && <p className="text-sm text-red-600 mt-1">{error}</p>}

        <DialogFooter className="gap-2">
          {/* 非超時模式下可取消 */}
          {!isTimeout && (
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              繼續作答
            </Button>
          )}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* 用 span 包裹，讓 disabled 的 Button 能觸發 Tooltip */}
                <span>
                  <Button
                    onClick={handleConfirm}
                    disabled={submitting || hasInFlight}
                    className="w-full"
                  >
                    {submitting ? '交卷中…' : '確認交卷'}
                  </Button>
                </span>
              </TooltipTrigger>
              {hasInFlight && (
                <TooltipContent>
                  <p>請等待判題完成</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
