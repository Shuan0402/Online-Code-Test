import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import api from '@/lib/api'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ExamFormPage() {
  const navigate = useNavigate()

  // --- 表單欄位狀態 ---
  const [title, setTitle] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(120)
  const [easyCount, setEasyCount] = useState(0)
  const [mediumCount, setMediumCount] = useState(0)
  const [hardCount, setHardCount] = useState(0)
  const [candidateId, setCandidateId] = useState('')

  // --- 候選人清單 ---
  const [candidates, setCandidates] = useState([])
  const [loadingCandidates, setLoadingCandidates] = useState(true)
  const [loadError, setLoadError] = useState(null)

  // --- 送出狀態 ---
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  // --- 前端驗證訊息 ---
  const [validationError, setValidationError] = useState(null)

  // mount 時取得使用者清單，過濾出 Candidate 角色
  useEffect(() => {
    let cancelled = false

    api
      .get('/api/v1/users/')
      .then((res) => {
        if (cancelled) return
        const onlyCandidates = (res.data ?? []).filter(
          (u) => u.role === 'Candidate'
        )
        setCandidates(onlyCandidates)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err.response?.data?.detail ?? '無法載入應試者清單，請稍後再試')
      })
      .finally(() => {
        if (!cancelled) setLoadingCandidates(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // --- 表單送出 ---
  const handleSubmit = async (e) => {
    e.preventDefault()
    setValidationError(null)
    setSubmitError(null)

    // 前端驗證
    if (!title.trim()) {
      setValidationError('請填寫考試標題')
      return
    }
    if (!candidateId) {
      setValidationError('請選擇應試者')
      return
    }

    setSubmitting(true)

    // 清空時的安全轉換：NaN → 預設值
    const parsedDuration = Number(durationMinutes)
    const parsedEasy = Number(easyCount)
    const parsedMedium = Number(mediumCount)
    const parsedHard = Number(hardCount)

    const body = {
      title: title.trim(),
      duration_minutes: Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : 120,
      easy_count: Number.isFinite(parsedEasy) ? parsedEasy : 0,
      medium_count: Number.isFinite(parsedMedium) ? parsedMedium : 0,
      hard_count: Number.isFinite(parsedHard) ? parsedHard : 0,
      // candidate_id 是 UUID 字串，不做數字轉換
      candidate_id: candidateId,
    }

    try {
      // POST /api/v1/exams/ → 201（注意尾部斜線）
      const res = await api.post('/api/v1/exams/', body)
      navigate(`/interviewer/exams/${res.data.id}`)
    } catch (err) {
      setSubmitError(err.response?.data?.detail ?? '建立失敗，請稍後再試')
    } finally {
      setSubmitting(false)
    }
  }

  // --- 渲染：候選人載入中 ---
  if (loadingCandidates) {
    return (
      <div className="flex justify-center items-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  // --- 渲染：候選人載入失敗 ---
  if (loadError) {
    return (
      <div className="p-6">
        <ErrorMessage message={loadError} />
        <div className="mt-4">
          <Button variant="outline" onClick={() => navigate('/interviewer')}>
            返回列表
          </Button>
        </div>
      </div>
    )
  }

  // --- 渲染：表單 ---
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* 頁首 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">新增考試</h1>
        <Button
          variant="outline"
          onClick={() => navigate('/interviewer')}
        >
          取消
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 考試標題 */}
        <div className="space-y-1">
          <Label htmlFor="title">考試標題</Label>
          <Input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="請輸入考試標題"
          />
        </div>

        {/* 考試時長 */}
        <div className="space-y-1">
          <Label htmlFor="duration-minutes">考試時長（分鐘）</Label>
          <Input
            id="duration-minutes"
            type="number"
            min="1"
            max="480"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
          />
        </div>

        {/* 題目配額（橫排） */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label htmlFor="easy-count">簡單題數</Label>
            <Input
              id="easy-count"
              type="number"
              min="0"
              max="20"
              value={easyCount}
              onChange={(e) => setEasyCount(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="medium-count">中等題數</Label>
            <Input
              id="medium-count"
              type="number"
              min="0"
              max="20"
              value={mediumCount}
              onChange={(e) => setMediumCount(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hard-count">困難題數</Label>
            <Input
              id="hard-count"
              type="number"
              min="0"
              max="20"
              value={hardCount}
              onChange={(e) => setHardCount(e.target.value)}
            />
          </div>
        </div>

        {/* 應試者下拉選單 */}
        <div className="space-y-1">
          <Label htmlFor="candidate-id">應試者</Label>
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              目前系統中沒有可選擇的應試者，請先由管理員建立應試者帳號
            </p>
          ) : (
            <select
              id="candidate-id"
              value={candidateId}
              onChange={(e) => setCandidateId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">— 請選擇應試者 —</option>
              {candidates.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.username}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* 前端驗證錯誤 */}
        {validationError && (
          <p className="text-sm font-medium text-destructive">{validationError}</p>
        )}

        {/* API 送出錯誤 */}
        {submitError && (
          <p className="text-sm font-medium text-destructive">{submitError}</p>
        )}

        {/* 底部按鈕列 */}
        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" disabled={submitting || candidates.length === 0}>
            {submitting ? '建立中…' : '建立考試'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/interviewer')}
            disabled={submitting}
          >
            取消
          </Button>
        </div>
      </form>
    </div>
  )
}
