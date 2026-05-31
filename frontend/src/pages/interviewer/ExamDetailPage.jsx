import { useState, useEffect, useCallback, Fragment } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'

import api from '@/lib/api'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import ExamStatusBadge from '@/components/ExamStatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

// 難度中文對照
const DIFFICULTY_LABELS = {
  Easy: '簡單',
  Medium: '中等',
  Hard: '困難',
}

// 難度標籤顏色
const DIFFICULTY_COLORS = {
  Easy: 'bg-green-100 text-green-800',
  Medium: 'bg-yellow-100 text-yellow-800',
  Hard: 'bg-red-100 text-red-800',
}

export default function ExamDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  // --- 考試資料 ---
  const [exam, setExam] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // --- 應試者名稱解析 ---
  // usersMap: { [uuid]: 'full_name || username' }
  const [usersMap, setUsersMap] = useState({})

  // --- 行內編輯欄位狀態（草稿模式才啟用） ---
  const [editTitle, setEditTitle] = useState('')
  const [editDuration, setEditDuration] = useState(120)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  // --- 自動生成題目 ---
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(null)

  // --- 手動新增題目 Dialog ---
  const [pickerOpen, setPickerOpen] = useState(false)
  const [problemBank, setProblemBank] = useState([])
  // 預覽中的題目 ID（picker dialog 內展開顯示完整 description）
  const [previewId, setPreviewId] = useState(null)
  // 存放動態取得的題目描述
  const [problemDescriptions, setProblemDescriptions] = useState({})
  const [bankLoading, setBankLoading] = useState(false)
  const [bankError, setBankError] = useState(null)
  // 正在加入中的 problem_id（int），防止重複點擊
  const [addingId, setAddingId] = useState(null)
  const [addError, setAddError] = useState(null)

  // --- 發佈考試 ---
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState(null)

  // --- 刪除確認 Dialog ---
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  // --- 初始載入：同時抓考試詳情 + 使用者清單 ---
  const fetchExam = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [examRes, usersRes] = await Promise.all([
        api.get(`/api/v1/exams/${id}`),
        api.get('/api/v1/users/'),
      ])

      const examData = examRes.data

      // 建立 uuid → 顯示名稱的查找表
      const map = {}
      ;(usersRes.data ?? []).forEach((u) => {
        map[u.id] = u.full_name || u.username
      })
      setUsersMap(map)

      setExam(examData)
      // 同步編輯欄位
      setEditTitle(examData.title)
      setEditDuration(examData.duration_minutes)
    } catch (err) {
      setError(err.response?.data?.detail ?? '載入考試資料失敗，請稍後再試')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchExam()
  }, [fetchExam])

  const isDraft = exam?.status === 'Draft'

  // --- 儲存編輯（PATCH，只送 title + duration_minutes，不含 status/times） ---
  // e 為 optional，讓底部「儲存設定」按鈕（不在 form 內）也能直接呼叫
  const handleSave = async (e) => {
    if (e?.preventDefault) e.preventDefault()
    if (!isDraft) {
      setSaveError('非草稿狀態不可編輯')
      return
    }
    setSaving(true)
    setSaveError(null)
    const parsedDuration = Number(editDuration)
    const body = {
      title: editTitle.trim() || exam.title,
      duration_minutes:
        Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : 120,
    }
    try {
      const res = await api.patch(`/api/v1/exams/${id}`, body)
      setExam(res.data)
      setEditTitle(res.data.title)
      setEditDuration(res.data.duration_minutes)
    } catch (err) {
      setSaveError(err.response?.data?.detail ?? '儲存失敗，請稍後再試')
    } finally {
      setSaving(false)
    }
  }

  // --- 自動生成題目 ---
  const handleGenerate = async () => {
    if (!isDraft) return
    setGenerating(true)
    setGenerateError(null)
    try {
      const res = await api.post(`/api/v1/exams/${id}/problems/generate`)
      setExam(res.data)
    } catch (err) {
      setGenerateError(err.response?.data?.detail ?? '自動生成失敗，請稍後再試')
    } finally {
      setGenerating(false)
    }
  }

  // --- 開啟手動新增題目 Dialog，同時載入題庫 ---
  const openPicker = async () => {
    setPickerOpen(true)
    setAddError(null)
    setBankError(null)
    setBankLoading(true)
    try {
      const res = await api.get('/api/v1/problems/')
      setProblemBank(res.data ?? [])
    } catch (err) {
      setBankError(err.response?.data?.detail ?? '載入題庫失敗，請稍後再試')
    } finally {
      setBankLoading(false)
    }
  }

  // --- 切換預覽題目描述並動態加載 ---
  const handleTogglePreview = async (problemId) => {
    if (previewId === problemId) {
      setPreviewId(null)
      return
    }
    setPreviewId(problemId)
    if (problemDescriptions[problemId] === undefined) {
      try {
        const res = await api.get(`/api/v1/problems/${problemId}`)
        setProblemDescriptions((prev) => ({
          ...prev,
          [problemId]: res.data?.description || null,
        }))
      } catch (err) {
        console.error('取得題目描述失敗：', err)
        setProblemDescriptions((prev) => ({
          ...prev,
          [problemId]: null,
        }))
      }
    }
  }

  // 已加入考試的 problem_id Set（int），用於過濾題庫
  const addedIds = new Set((exam?.exam_problems ?? []).map((p) => p.problem_id))

  // 過濾掉已加入的題目，避免重複加入
  const availableProblems = problemBank.filter((p) => !addedIds.has(p.id))

  // --- 加入題目（problem_id 必須是 int，不能是字串） ---
  const handleAddProblem = async (problemId) => {
    setAddingId(problemId)
    setAddError(null)

    // 前端擋：不可超過建立考試時設定的各難度題數上限
    const target = problemBank.find((p) => p.id === problemId)
    if (target && exam) {
      const quotaKey = {
        Easy: 'easy_count',
        Medium: 'medium_count',
        Hard: 'hard_count',
      }[target.difficulty]
      const quota = exam[quotaKey] ?? 0
      const currentCount = (exam.exam_problems ?? []).filter(
        (ep) => ep.difficulty === target.difficulty
      ).length
      if (quota !== undefined && quota !== null && currentCount >= quota) {
        setAddError(`已達${DIFFICULTY_LABELS[target.difficulty]}題數上限（${quota}）`)
        setAddingId(null)
        return
      }
    }

    try {
      // problem_id 是題庫的 int id；points 預設 100
      const res = await api.post(`/api/v1/exams/${id}/problems`, {
        problem_id: Number(problemId), // 明確轉為 int，確保不送字串
        points: 100,
      })
      setExam(res.data)
      // 重新過濾 availableProblems 會自動更新（addedIds 是從新 exam 派生的）
    } catch (err) {
      // 400 可能是重複加入或非草稿，gracefully 顯示 detail
      setAddError(err.response?.data?.detail ?? '加入題目失敗，請稍後再試')
    } finally {
      setAddingId(null)
    }
  }

  // --- 發佈考試 ---
  const handlePublish = async () => {
    if (!isDraft) return
    setPublishing(true)
    setPublishError(null)
    try {
      const res = await api.post(`/api/v1/exams/${id}/publish`)
      setExam(res.data)
    } catch (err) {
      setPublishError(err.response?.data?.detail ?? '發佈失敗，請稍後再試')
    } finally {
      setPublishing(false)
    }
  }

  // --- 刪除考試 ---
  const confirmDelete = async () => {
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      await api.delete(`/api/v1/exams/${id}`)
      navigate('/interviewer')
    } catch (err) {
      setDeleteError(err.response?.data?.detail ?? '刪除失敗，請稍後再試')
    } finally {
      setDeleteLoading(false)
    }
  }

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
        <ErrorMessage message={error} onRetry={fetchExam} />
        <div className="mt-4">
          <Button variant="outline" onClick={() => navigate('/interviewer')}>
            返回列表
          </Button>
        </div>
      </div>
    )
  }

  const candidateName = usersMap[exam.candidate_id] ?? exam.candidate_id ?? '—'

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* 頁首 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link to="/interviewer">← 返回列表</Link>
          </Button>
          <h1 className="text-2xl font-semibold">{exam.title}</h1>
          <ExamStatusBadge status={exam.status} />
        </div>
        {/* 查看結果（已發佈後才有意義，但連結永遠顯示） */}
        <Button variant="outline" size="sm" asChild>
          <Link to={`/interviewer/exams/${id}/result`}>查看結果</Link>
        </Button>
      </div>

      {/* 考試基本資訊（只讀部分） */}
      <div className="rounded-lg border p-4 space-y-2 text-sm">
        <div>
          <span className="font-medium text-muted-foreground">應試者：</span>
          <span>{candidateName}</span>
        </div>
        <div>
          <span className="font-medium text-muted-foreground">難度配額：</span>
          <span>
            簡單 {exam.easy_count} ／ 中等 {exam.medium_count} ／ 困難 {exam.hard_count}
          </span>
        </div>
      </div>

      {/* 編輯區塊（Draft 才啟用） */}
      <section className="rounded-lg border p-4 space-y-4">
        <h2 className="text-base font-semibold">考試設定</h2>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="edit-title">考試標題</Label>
            <Input
              id="edit-title"
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              disabled={!isDraft}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-duration">考試時長（分鐘）</Label>
            <Input
              id="edit-duration"
              type="number"
              min="1"
              value={editDuration}
              onChange={(e) => setEditDuration(e.target.value)}
              disabled={!isDraft}
            />
          </div>
          {saveError && (
            <p className="text-sm font-medium text-destructive">{saveError}</p>
          )}
        </form>
      </section>

      {/* 題目列表 */}
      <section className="rounded-lg border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-muted">
          <h2 className="text-base font-semibold">題目列表</h2>
          <div className="flex items-center gap-2">
            {/* 自動生成 */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              disabled={!isDraft || generating}
            >
              {generating ? '生成中…' : '自動生成題目'}
            </Button>
            {/* 手動新增 */}
            <Button
              variant="outline"
              size="sm"
              onClick={openPicker}
              disabled={!isDraft}
            >
              新增題目
            </Button>
          </div>
        </div>

        {/* 自動生成錯誤 */}
        {generateError && (
          <p className="px-4 py-2 text-sm font-medium text-destructive">{generateError}</p>
        )}

        {exam.exam_problems.length === 0 ? (
          <p className="text-center text-muted-foreground py-10 text-sm">尚未加入任何題目</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium w-16">題號</th>
                <th className="px-4 py-3 text-left font-medium">題目名稱</th>
                <th className="px-4 py-3 text-left font-medium w-24">難度</th>
                <th className="px-4 py-3 text-left font-medium w-20">配分</th>
                {!isDraft && (
                  <th className="px-4 py-3 text-left font-medium w-24">操作</th>
                )}
              </tr>
            </thead>
            <tbody>
              {exam.exam_problems.map((problem) => (
                // 鍵使用 problem_id（int），絕不用陣列索引（L1 pre-emption）
                <tr
                  key={problem.problem_id}
                  data-problem-id={problem.problem_id}
                  className="border-t hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3 text-muted-foreground">{problem.sequence}</td>
                  <td className="px-4 py-3 font-medium">{problem.title}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                        DIFFICULTY_COLORS[problem.difficulty] ?? 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {DIFFICULTY_LABELS[problem.difficulty] ?? problem.difficulty}
                    </span>
                  </td>
                  <td className="px-4 py-3">{problem.points}</td>
                  {!isDraft && (
                    <td className="px-4 py-3">
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/interviewer/exams/${id}/problems/${problem.problem_id}`}>
                          查看提交
                        </Link>
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 操作按鈕列 — 儲存設定 / 發佈考試 / 刪除考試 同行 */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* 儲存設定（Draft 才能改） */}
        <Button
          variant="outline"
          onClick={() => handleSave()}
          disabled={!isDraft || saving}
        >
          {saving ? '儲存中…' : '儲存設定'}
        </Button>

        {/* 發佈考試（Draft 且題數足夠才啟用） */}
        <Button
          onClick={handlePublish}
          disabled={
            !isDraft ||
            exam.exam_problems.length === 0 ||
            exam.exam_problems.length <
              ((exam.easy_count || 0) + (exam.medium_count || 0) + (exam.hard_count || 0)) ||
            publishing
          }
        >
          {publishing ? '發佈中…' : '發佈考試'}
        </Button>

        {/* 刪除考試 */}
        <Button
          variant="destructive"
          onClick={() => {
            setDeleteError(null)
            setDeleteOpen(true)
          }}
        >
          刪除考試
        </Button>
      </div>

      {/* 題數不足提醒 */}
      {isDraft &&
        exam.exam_problems.length <
          ((exam.easy_count || 0) + (exam.medium_count || 0) + (exam.hard_count || 0)) && (
          <p className="text-sm font-medium text-amber-600 mt-2">
            ⚠️ 目前配置題目數量不足（設定 {((exam.easy_count || 0) + (exam.medium_count || 0) + (exam.hard_count || 0))} 題，已配置 {exam.exam_problems.length} 題），暫不可發佈。
          </p>
        )}

      {/* 發佈錯誤 */}
      {publishError && (
        <p className="text-sm font-medium text-destructive mt-2">{publishError}</p>
      )}

      {/* 手動新增題目 Dialog */}
      <Dialog
        open={pickerOpen}
        onOpenChange={(open) => {
          if (!open) {
            setPickerOpen(false)
            setAddError(null)
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>選擇題目</DialogTitle>
            <DialogDescription>
              從題庫中選擇題目加入考試。已加入的題目不會顯示。
            </DialogDescription>
          </DialogHeader>

          {bankLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : bankError ? (
            <p className="text-sm font-medium text-destructive">{bankError}</p>
          ) : availableProblems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {problemBank.length === 0 ? '題庫中尚無題目' : '所有題目已加入考試'}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">題目名稱</th>
                  <th className="px-3 py-2 text-left font-medium w-20">難度</th>
                  <th className="px-3 py-2 text-left font-medium w-32">操作</th>
                </tr>
              </thead>
              <tbody>
                {availableProblems.map((p) => (
                  <Fragment key={p.id}>
                    <tr className="border-t hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 font-medium">{p.title}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                            DIFFICULTY_COLORS[p.difficulty] ?? 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {DIFFICULTY_LABELS[p.difficulty] ?? p.difficulty}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleTogglePreview(p.id)}
                          >
                            {previewId === p.id ? '收合' : '預覽'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAddProblem(p.id)}
                            disabled={addingId !== null}
                          >
                            {addingId === p.id ? '加入中…' : '加入'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {previewId === p.id && (
                      <tr className="border-t bg-muted/20">
                        <td colSpan={3} className="px-4 py-3">
                          <div className="prose prose-sm max-w-none text-sm">
                            {problemDescriptions[p.id] === undefined ? (
                              <p className="text-muted-foreground italic animate-pulse">載入中…</p>
                            ) : problemDescriptions[p.id] ? (
                              <ReactMarkdown>{problemDescriptions[p.id]}</ReactMarkdown>
                            ) : (
                              <p className="text-muted-foreground italic">（此題目沒有描述）</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}

          {/* 加入失敗的 inline 錯誤 */}
          {addError && (
            <p className="text-sm font-medium text-destructive mt-2">{addError}</p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPickerOpen(false)
                setAddError(null)
              }}
            >
              關閉
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 刪除確認 Dialog */}
      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteOpen(false)
            setDeleteError(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認刪除</DialogTitle>
            <DialogDescription>
              確定要刪除考試「{exam.title}」嗎？此操作無法復原。
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p className="text-sm font-medium text-destructive">{deleteError}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteOpen(false)
                setDeleteError(null)
              }}
              disabled={deleteLoading}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteLoading}
            >
              {deleteLoading ? '刪除中…' : '確認刪除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
