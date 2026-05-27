import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/lib/api'
import ExamStatusBadge from '@/components/ExamStatusBadge'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// Exams with these statuses show the "開始作答" button.
const STARTABLE_STATUSES = ['Published', 'Ongoing']

export default function ExamListPage() {
  const navigate = useNavigate()

  // ── Exam list state ──────────────────────────────────────────────────────
  const [exams, setExams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // ── Dialog state ─────────────────────────────────────────────────────────
  const [selectedExam, setSelectedExam] = useState(null) // exam object, or null
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState(null)

  // ── Fetch exam list (stable ref so it can be passed to ErrorMessage.onRetry) ─
  const fetchExams = useCallback(() => {
    setLoading(true)
    setError(null)

    api.get('/api/v1/exams/')
      .then((res) => {
        setExams(res.data)
      })
      .catch(() => {
        setError('無法載入考試列表，請稍後再試。')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  // ── Fetch on mount ────────────────────────────────────────────────────────
  useEffect(() => {
    fetchExams()
  }, [fetchExams])

  // ── Open / close confirmation dialog ────────────────────────────────────
  function openDialog(exam) {
    setSelectedExam(exam)
    setStartError(null)
    setStarting(false)
  }

  function closeDialog() {
    if (starting) return // prevent close while network call in-flight
    setSelectedExam(null)
    setStartError(null)
  }

  // ── Confirm start ────────────────────────────────────────────────────────
  async function handleConfirmStart() {
    if (!selectedExam) return
    setStarting(true)
    setStartError(null)
    try {
      await api.post(`/api/v1/exams/${selectedExam.id}/start`)
      navigate(`/candidate/exams/${selectedExam.id}/take`)
    } catch (err) {
      setStartError('無法開始考試，請稍後再試。')
      setStarting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-3xl mx-auto overflow-y-auto h-full">
      <h1 className="text-2xl font-semibold mb-6">我的考試</h1>

      {loading && (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      )}

      {!loading && error && (
        <ErrorMessage message={error} onRetry={fetchExams} />
      )}

      {!loading && !error && exams.length === 0 && (
        <p className="text-muted-foreground text-center py-12">目前沒有考試</p>
      )}

      {!loading && !error && exams.length > 0 && (
        <div className="space-y-4">
          {exams.map((exam) => (
            <div
              key={exam.id}
              className="border rounded-lg p-4 flex items-center justify-between gap-4 bg-white shadow-sm"
            >
              {/* Left: exam info */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-base truncate">{exam.title}</p>
                <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
                  <ExamStatusBadge status={exam.status} />
                  <span>時長：{exam.duration_minutes ?? exam.duration ?? '—'} 分鐘</span>
                  {exam.status === 'Finished' && exam.score != null && (
                    <span>得分：{exam.score}</span>
                  )}
                </div>
              </div>

              {/* Right: action button */}
              {STARTABLE_STATUSES.includes(exam.status) && (
                <Button
                  onClick={() => openDialog(exam)}
                  className="shrink-0"
                >
                  開始作答
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Start-exam confirmation dialog ─────────────────────────────── */}
      <Dialog open={!!selectedExam} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認開始考試？</DialogTitle>
            <DialogDescription>
              開始後計時將立即開始，請確認您已準備就緒。
            </DialogDescription>
          </DialogHeader>

          {startError && (
            <p className="text-red-500 text-sm mt-1">{startError}</p>
          )}

          <DialogFooter className="mt-4 flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={closeDialog}
              disabled={starting}
            >
              取消
            </Button>
            <Button
              onClick={handleConfirmStart}
              disabled={starting}
            >
              {starting ? '開始中…' : '確認開始'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
