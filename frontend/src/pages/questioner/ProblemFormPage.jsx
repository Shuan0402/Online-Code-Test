import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

import api from '@/lib/api'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// 難度選項（API 值 → 中文顯示）
const DIFFICULTY_OPTIONS = [
  { value: 'Easy', label: '簡單' },
  { value: 'Medium', label: '中等' },
  { value: 'Hard', label: '困難' },
]

// 單調遞增客戶端 key 計數器（每個 session 唯一）
let _clientKeyCounter = 0

// 建立一個空的測資列（新增測資時使用，沒有 id）
function newTestCaseRow() {
  return {
    // 注意：不帶 id — 對應 backend 的「新建」語義
    // _clientKey 提供穩定的 React key，不傳送至後端
    _clientKey: ++_clientKeyCounter,
    input_data: '',
    expected_output: '',
    score_weight: 10,
    is_sample: false,
  }
}

export default function ProblemFormPage() {
  const { id } = useParams()          // edit 模式時有值；create 模式時 undefined
  const isEditMode = !!id
  const navigate = useNavigate()

  // --- 表單欄位狀態 ---
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [difficulty, setDifficulty] = useState('Easy')
  const [timeLimit, setTimeLimit] = useState(1000)   // ms
  const [memoryLimit, setMemoryLimit] = useState(256) // MB

  // --- 測資列狀態 ---
  // 每列：{ id?, _clientKey, input_data, expected_output, score_weight, is_sample }
  // 現有測資帶 id；新增的不帶 id（_clientKey 提供穩定 React key，不送至後端）
  const [testCases, setTestCases] = useState([])

  // --- 載入狀態（edit 模式的初始 fetch）---
  const [loadingInit, setLoadingInit] = useState(isEditMode)
  const [loadError, setLoadError] = useState(null)

  // --- 送出狀態 ---
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  // --- 前端驗證訊息 ---
  const [validationError, setValidationError] = useState(null)

  // edit 模式：在 mount 時 fetch 題目資料
  const fetchProblem = useCallback(() => {
    if (!isEditMode) return

    let cancelled = false
    setLoadingInit(true)
    setLoadError(null)

    api
      .get(`/api/v1/problems/${id}`)
      .then((res) => {
        if (cancelled) return
        const data = res.data
        setTitle(data.title ?? '')
        setDescription(data.description ?? '')
        setDifficulty(data.difficulty ?? 'Easy')
        setTimeLimit(data.time_limit ?? 1000)
        setMemoryLimit(data.memory_limit ?? 256)

        // 將 ProblemRead.test_cases 轉成本地 state 格式
        // 每列保留 id（用於 PATCH 語義），其餘欄位直接帶入
        // 若後端回傳 test_cases: []，保持空陣列 — 讓「至少需要一筆測試資料」驗證觸發
        const rows = (data.test_cases ?? []).map((tc) => ({
          id: tc.id,                          // 保留 id → backend 會視為「更新」
          _clientKey: ++_clientKeyCounter,    // 穩定 React key
          input_data: tc.input_data ?? '',
          expected_output: tc.expected_output ?? '',
          score_weight: tc.score_weight ?? 10,
          is_sample: tc.is_sample ?? false,
        }))
        setTestCases(rows)
      })
      .catch((err) => {
        if (cancelled) return
        if (err.response?.status === 404) {
          setLoadError('載入失敗，找不到此題目')
        } else {
          setLoadError(err.response?.data?.detail ?? '載入失敗，請稍後再試')
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingInit(false)
      })

    return () => {
      cancelled = true
    }
  }, [id, isEditMode])

  useEffect(() => {
    const cleanup = fetchProblem()
    return cleanup
  }, [fetchProblem])

  // --- 測資列操作 ---
  const addTestCase = () => {
    setTestCases((prev) => [...prev, newTestCaseRow()])
  }

  const removeTestCase = (index) => {
    setTestCases((prev) => prev.filter((_, i) => i !== index))
  }

  // 更新單一測資列的某個欄位
  const updateTestCase = (index, field, value) => {
    setTestCases((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    )
  }

  // --- 表單送出 ---
  const handleSubmit = async (e) => {
    e.preventDefault()
    setValidationError(null)
    setSubmitError(null)

    // 前端驗證
    if (!title.trim()) {
      setValidationError('請填寫題目標題')
      return
    }
    if (testCases.length === 0) {
      setValidationError('至少需要一筆測試資料')
      return
    }

    setSubmitting(true)

    // 組合 test_cases payload：
    // - 現有測資（帶 id）→ backend 更新
    // - 新增測資（不帶 id）→ backend 新建
    // - 被刪除的測資（不在陣列中）→ backend 刪除
    const testCasesPayload = testCases.map((tc) => {
      // 將字串型 score_weight 轉為數字；清空時預設 10
      const parsedScore = Number(tc.score_weight)
      const row = {
        input_data: tc.input_data,
        expected_output: tc.expected_output,
        score_weight: Number.isFinite(parsedScore) ? parsedScore : 10,
        is_sample: tc.is_sample,
        // _clientKey 不送至後端（僅 React key 用途）
      }
      // 只有現有測資才帶 id
      if (tc.id !== undefined) {
        row.id = tc.id
      }
      return row
    })

    // 清空時的安全轉換：NaN → 預設值
    const parsedTimeLimit = Number(timeLimit)
    const parsedMemoryLimit = Number(memoryLimit)

    const body = {
      title: title.trim(),
      description,
      difficulty,
      time_limit: Number.isFinite(parsedTimeLimit) ? parsedTimeLimit : 1000,
      memory_limit: Number.isFinite(parsedMemoryLimit) ? parsedMemoryLimit : 256,
      test_cases: testCasesPayload,
    }

    try {
      if (isEditMode) {
        // PATCH /api/v1/problems/{id} → 200
        await api.patch(`/api/v1/problems/${id}`, body)
      } else {
        // POST /api/v1/problems/ → 201（注意尾部斜線）
        await api.post('/api/v1/problems/', body)
      }
      navigate('/questioner/problems')
    } catch (err) {
      setSubmitError(err.response?.data?.detail ?? '儲存失敗，請稍後再試')
    } finally {
      setSubmitting(false)
    }
  }

  // --- 渲染：初始載入中 ---
  if (loadingInit) {
    return (
      <div className="flex justify-center items-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  // --- 渲染：初始載入失敗 ---
  if (loadError) {
    return (
      <div className="p-6">
        <ErrorMessage message={loadError} onRetry={fetchProblem} />
        <div className="mt-4">
          <Button variant="outline" onClick={() => navigate('/questioner/problems')}>
            返回列表
          </Button>
        </div>
      </div>
    )
  }

  // --- 渲染：表單 ---
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* 頁首 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {isEditMode ? '編輯題目' : '新增題目'}
        </h1>
        <Button
          variant="outline"
          onClick={() => navigate('/questioner/problems')}
        >
          取消
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 題目標題 */}
        <div className="space-y-1">
          <Label htmlFor="title">題目標題</Label>
          <Input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="請輸入題目標題"
          />
        </div>

        {/* 題目描述 */}
        <div className="space-y-1">
          <Label htmlFor="description">題目描述</Label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="請輸入題目描述（支援 Markdown 或純文字）"
            rows={6}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
          />
        </div>

        {/* 難度、時間限制、記憶體限制（橫排） */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* 難度 */}
          <div className="space-y-1">
            <Label htmlFor="difficulty">難度</Label>
            <select
              id="difficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {DIFFICULTY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* 時間限制（ms） */}
          <div className="space-y-1">
            <Label htmlFor="time-limit">時間限制（毫秒）</Label>
            <Input
              id="time-limit"
              type="number"
              min={1}
              value={timeLimit}
              onChange={(e) => setTimeLimit(e.target.value)}
            />
          </div>

          {/* 記憶體限制（MB） */}
          <div className="space-y-1">
            <Label htmlFor="memory-limit">記憶體限制（MB）</Label>
            <Input
              id="memory-limit"
              type="number"
              min={1}
              value={memoryLimit}
              onChange={(e) => setMemoryLimit(e.target.value)}
            />
          </div>
        </div>

        {/* 測資編輯器 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">測試資料</h2>
            <Button type="button" variant="outline" size="sm" onClick={addTestCase}>
              新增一筆測資
            </Button>
          </div>

          {testCases.length === 0 && (
            <p className="text-sm text-muted-foreground">尚未新增任何測試資料</p>
          )}

          {testCases.map((tc, index) => (
            <div
              key={tc.id ?? tc._clientKey}
              className="rounded-lg border p-4 space-y-3 bg-muted/20"
            >
              {/* 測資標頭：序號 + 刪除按鈕 */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  測資 #{index + 1}
                  {tc.id !== undefined && (
                    <span className="ml-2 text-xs text-muted-foreground/60">
                      (id: {tc.id})
                    </span>
                  )}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => removeTestCase(index)}
                >
                  移除
                </Button>
              </div>

              {/* 輸入資料 */}
              <div className="space-y-1">
                <Label htmlFor={`input-${index}`}>輸入</Label>
                <textarea
                  id={`input-${index}`}
                  value={tc.input_data}
                  onChange={(e) => updateTestCase(index, 'input_data', e.target.value)}
                  placeholder="測資輸入（stdin）"
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                />
              </div>

              {/* 預期輸出 */}
              <div className="space-y-1">
                <Label htmlFor={`output-${index}`}>預期輸出</Label>
                <textarea
                  id={`output-${index}`}
                  value={tc.expected_output}
                  onChange={(e) => updateTestCase(index, 'expected_output', e.target.value)}
                  placeholder="預期輸出（stdout）"
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                />
              </div>

              {/* 配分 + 範例測資 checkbox（橫排） */}
              <div className="flex items-center gap-6">
                <div className="space-y-1 w-32">
                  <Label htmlFor={`score-${index}`}>配分</Label>
                  <Input
                    id={`score-${index}`}
                    type="number"
                    min={0}
                    value={tc.score_weight}
                    onChange={(e) =>
                      updateTestCase(index, 'score_weight', e.target.value)
                    }
                  />
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <input
                    id={`sample-${index}`}
                    type="checkbox"
                    checked={tc.is_sample}
                    onChange={(e) =>
                      updateTestCase(index, 'is_sample', e.target.checked)
                    }
                    className="h-4 w-4 rounded border-gray-300 accent-primary"
                  />
                  <Label htmlFor={`sample-${index}`} className="cursor-pointer">
                    範例測資（題目頁面顯示）
                  </Label>
                </div>
              </div>
            </div>
          ))}
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
            {submitting ? '儲存中…' : isEditMode ? '儲存變更' : '新增題目'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/questioner/problems')}
            disabled={submitting}
          >
            取消
          </Button>
        </div>
      </form>
    </div>
  )
}
