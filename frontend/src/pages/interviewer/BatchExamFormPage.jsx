import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import api from '@/lib/api'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function BatchExamFormPage() {
  const navigate = useNavigate()

  // --- 表單欄位狀態 ---
  const [title, setTitle] = useState('')
  const [tag, setTag] = useState('')
  const [existingTags, setExistingTags] = useState([])
  const [tagCandidatesCount, setTagCandidatesCount] = useState(null) // 該標籤符合的考生數
  const [isOpen, setIsOpen] = useState(false)
  const [durationMinutes, setDurationMinutes] = useState(120)
  const [easyCount, setEasyCount] = useState(0)
  const [mediumCount, setMediumCount] = useState(0)
  const [hardCount, setHardCount] = useState(0)
  const [autoGenerate, setAutoGenerate] = useState(true)

  // Click outside dropdown handler
  useEffect(() => {
    const handleOutsideClick = (e) => {
      const container = document.getElementById('batch-tag-container')
      if (container && !container.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('click', handleOutsideClick)
    return () => {
      document.removeEventListener('click', handleOutsideClick)
    }
  }, [])

  const filteredTags = existingTags.filter((t) =>
    t.toLowerCase().includes(tag.toLowerCase())
  )

  const handleAddNewTag = () => {
    const trimmed = tag.trim()
    if (trimmed && !existingTags.includes(trimmed)) {
      setExistingTags((prev) => [...prev, trimmed])
    }
    setIsOpen(false)
  }

  // --- 題庫各難度可用題數（防呆提醒用） ---
  const [problemStats, setProblemStats] = useState({ Easy: 0, Medium: 0, Hard: 0 })

  // --- 送出狀態 ---
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  // --- 前端驗證訊息 ---
  const [validationError, setValidationError] = useState(null)

  // 查詢標籤對應的考生人數
  const fetchTagCandidateCount = async (selectedTag) => {
    if (!selectedTag) {
      setTagCandidatesCount(null)
      return
    }
    try {
      const res = await api.get('/api/v1/users/', {
        params: { tag: selectedTag, role: 'Candidate' },
      })
      const candidates = (res.data ?? []).filter((u) => u.role === 'Candidate')
      setTagCandidatesCount(candidates.length)
    } catch {
      setTagCandidatesCount(null)
    }
  }

  // mount 時取得標籤列表 + 題庫統計
  useEffect(() => {
    let cancelled = false

    api
      .get('/api/v1/exams/tags')
      .then((res) => {
        if (cancelled) return
        setExistingTags(res.data ?? [])
      })
      .catch((err) => {
        console.error('無法載入標籤列表', err)
      })

    // 題庫統計
    api
      .get('/api/v1/problems/')
      .then((res) => {
        if (cancelled) return
        const stats = { Easy: 0, Medium: 0, Hard: 0 }
        for (const p of res.data ?? []) {
          if (stats[p.difficulty] !== undefined) stats[p.difficulty] += 1
        }
        setProblemStats(stats)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  // 各難度設定值是否超過題庫可用數
  const exceedsBank = {
    Easy: Number(easyCount) > problemStats.Easy,
    Medium: Number(mediumCount) > problemStats.Medium,
    Hard: Number(hardCount) > problemStats.Hard,
  }
  const anyExceeds = exceedsBank.Easy || exceedsBank.Medium || exceedsBank.Hard

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
    if (!tag.trim()) {
      setValidationError('請選擇或輸入標籤')
      return
    }

    setSubmitting(true)

    const parsedDuration = Number(durationMinutes)
    const parsedEasy = Number(easyCount)
    const parsedMedium = Number(mediumCount)
    const parsedHard = Number(hardCount)

    const body = {
      title: title.trim(),
      tag: tag.trim(),
      duration_minutes: Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : 120,
      easy_count: Number.isFinite(parsedEasy) ? parsedEasy : 0,
      medium_count: Number.isFinite(parsedMedium) ? parsedMedium : 0,
      hard_count: Number.isFinite(parsedHard) ? parsedHard : 0,
      auto_generate: autoGenerate,
    }

    try {
      const res = await api.post('/api/v1/exams/batch', body)
      const result = res.data
      // 導向列表頁，並帶上結果資訊
      navigate('/interviewer', {
        state: {
          batchResult: {
            success_count: result.success_count,
            failed_count: result.failed_count,
            total_requested: result.total_requested,
          },
        },
      })
    } catch (err) {
      setSubmitError(err.response?.data?.detail ?? '批次建立失敗，請稍後再試')
    } finally {
      setSubmitting(false)
    }
  }

  // --- 渲染 ---
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* 頁首 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">批次新增考試</h1>
        <Button variant="outline" onClick={() => navigate('/interviewer')}>
          取消
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 考試標題 */}
        <div className="space-y-1">
          <Label htmlFor="batch-title">考試標題</Label>
          <Input
            id="batch-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="請輸入考試標題"
          />
        </div>

        {/* 標籤選擇（關鍵：批次就是依此標籤找出對應考生） */}
        <div className="space-y-1 relative" id="batch-tag-container">
          <Label htmlFor="batch-tag">
            選擇標籤 <span className="text-sm text-muted-foreground">（將為此標籤的所有考生建立考試）</span>
          </Label>
          <div className="relative">
            <Input
              id="batch-tag"
              type="text"
              value={tag}
              onChange={(e) => {
                setTag(e.target.value)
                setTagCandidatesCount(null)
                setIsOpen(true)
              }}
              onFocus={() => setIsOpen(true)}
              placeholder="選擇或輸入標籤名稱"
              autoComplete="off"
              className="pr-10"
            />
            <div
              className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground p-1"
              onClick={(e) => {
                e.stopPropagation()
                setIsOpen((prev) => !prev)
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
          </div>

          {/* 預估考生人數 */}
          {tag.trim() && tagCandidatesCount !== null && (
            <p className="text-sm text-muted-foreground">
              符合標籤「{tag}」的考生約有 <span className="font-medium">{tagCandidatesCount}</span> 人
            </p>
          )}

          {isOpen && (
            <div className="absolute left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md z-50">
              <ul className="py-1 text-sm">
                {filteredTags.length > 0 ? (
                  filteredTags.map((t) => (
                    <li
                      key={t}
                      onClick={() => {
                        setTag(t)
                        setIsOpen(false)
                        fetchTagCandidateCount(t)
                      }}
                      className="px-3 py-2 hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
                    >
                      {t}
                    </li>
                  ))
                ) : (
                  tag.trim() ? null : (
                    <li className="px-3 py-2 text-muted-foreground text-center">
                      目前沒有現有標籤
                    </li>
                  )
                )}

                {tag.trim() && filteredTags.length === 0 && (
                  <li
                    onClick={handleAddNewTag}
                    className="px-3 py-2 text-primary hover:bg-accent hover:text-accent-foreground cursor-pointer font-medium border-t border-muted transition-colors"
                  >
                    + 新增標籤「{tag}」
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        {/* 考試時長 */}
        <div className="space-y-1">
          <Label htmlFor="batch-duration-minutes">考試時長（分鐘）</Label>
          <Input
            id="batch-duration-minutes"
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
            <Label htmlFor="batch-easy-count">簡單題數</Label>
            <Input
              id="batch-easy-count"
              type="number"
              min="0"
              max="20"
              value={easyCount}
              onChange={(e) => setEasyCount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">題庫可用：{problemStats.Easy}</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="batch-medium-count">中等題數</Label>
            <Input
              id="batch-medium-count"
              type="number"
              min="0"
              max="20"
              value={mediumCount}
              onChange={(e) => setMediumCount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">題庫可用：{problemStats.Medium}</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="batch-hard-count">困難題數</Label>
            <Input
              id="batch-hard-count"
              type="number"
              min="0"
              max="20"
              value={hardCount}
              onChange={(e) => setHardCount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">題庫可用：{problemStats.Hard}</p>
          </div>
        </div>

        {/* 題庫不足防呆提醒 */}
        {anyExceeds && (
          <p className="text-sm font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            ⚠️ 設定的題數超過題庫可用量
            {exceedsBank.Easy && `（簡單：要 ${easyCount}、有 ${problemStats.Easy}）`}
            {exceedsBank.Medium && `（中等：要 ${mediumCount}、有 ${problemStats.Medium}）`}
            {exceedsBank.Hard && `（困難：要 ${hardCount}、有 ${problemStats.Hard}）`}
            ，建立考試後可能無法自動填滿題目。
          </p>
        )}

        {/* 是否自動抽選題目 */}
        <div className="flex items-center gap-3">
          <input
            id="batch-auto-generate"
            type="checkbox"
            checked={autoGenerate}
            onChange={(e) => setAutoGenerate(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <Label htmlFor="batch-auto-generate" className="cursor-pointer">
            建立後自動抽選題目
          </Label>
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
          <Button type="submit" disabled={submitting}>
            {submitting ? '批次建立中…' : '批次建立考試'}
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