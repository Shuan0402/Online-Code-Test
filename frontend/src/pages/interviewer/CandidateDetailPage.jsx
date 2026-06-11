import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'

import api from '@/lib/api'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import ExamStatusBadge from '@/components/ExamStatusBadge'
import TagMultiSelect from '@/components/TagMultiSelect'
import { Button } from '@/components/ui/button'

function formatDatetime(isoStr) {
  if (!isoStr) return '—'
  return new Date(isoStr).toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function tagsEqual(a, b) {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((tag, i) => tag === sortedB[i])
}

export default function CandidateDetailPage() {
  const { id: userId } = useParams()

  const [candidate, setCandidate] = useState(null)
  const [userLoading, setUserLoading] = useState(true)
  const [userError, setUserError] = useState(null)

  const [tags, setTags] = useState([])
  const [savedTags, setSavedTags] = useState([])
  const [tagsSaving, setTagsSaving] = useState(false)
  const [tagsError, setTagsError] = useState(null)
  const [tagsSuccess, setTagsSuccess] = useState(false)

  const [candidateExams, setCandidateExams] = useState([])
  const [examsLoading, setExamsLoading] = useState(true)
  const [examsError, setExamsError] = useState(null)

  // Fetch candidate profile
  useEffect(() => {
    async function loadUser() {
      setUserLoading(true)
      setUserError(null)
      try {
        const res = await api.get(`/api/v1/users/${userId}`)
        setCandidate(res.data)
        const initialTags = res.data.tags ?? []
        setTags(initialTags)
        setSavedTags(initialTags)
      } catch (err) {
        const status = err.response?.status
        if (status === 404) {
          setUserError('找不到此考生（404）')
        } else {
          setUserError(err.response?.data?.detail ?? '載入考生資料失敗，請稍後再試')
        }
      } finally {
        setUserLoading(false)
      }
    }
    loadUser()
  }, [userId])

  // 由後端的 ?candidate_id= 直接篩出該考生的考試，一個請求取代原本的 N+1 fan-out
  useEffect(() => {
    async function loadExams() {
      setExamsLoading(true)
      setExamsError(null)
      try {
        const res = await api.get(`/api/v1/exams/?candidate_id=${userId}`)
        setCandidateExams(res.data)
      } catch (err) {
        setExamsError('無法載入考試列表')
      } finally {
        setExamsLoading(false)
      }
    }
    loadExams()
  }, [userId])

  const tagsDirty = !tagsEqual(tags, savedTags)

  const handleSaveTags = async () => {
    setTagsSaving(true)
    setTagsError(null)
    setTagsSuccess(false)
    try {
      const res = await api.patch(`/api/v1/users/${userId}/tags`, { tags })
      const updatedTags = res.data.tags ?? []
      setTags(updatedTags)
      setSavedTags(updatedTags)
      setCandidate((prev) => (prev ? { ...prev, tags: updatedTags } : prev))
      setTagsSuccess(true)
    } catch (err) {
      setTagsError(err.response?.data?.detail ?? '儲存標籤失敗，請稍後再試')
    } finally {
      setTagsSaving(false)
    }
  }

  // Render user profile section
  const renderProfile = () => {
    if (userLoading) {
      return (
        <div className="flex justify-center items-center py-10">
          <LoadingSpinner size="lg" />
        </div>
      )
    }
    if (userError) {
      return <ErrorMessage message={userError} />
    }
    return (
      <div className="rounded-lg border p-6 space-y-6">
        <div className="grid grid-cols-2 gap-y-3 text-sm">
          <span className="font-medium text-muted-foreground">姓名</span>
          <span>{candidate.full_name ?? '—'}</span>
          <span className="font-medium text-muted-foreground">帳號</span>
          <span>{candidate.username}</span>
          <span className="font-medium text-muted-foreground">角色</span>
          <span>{candidate.role}</span>
          <span className="font-medium text-muted-foreground">建立時間</span>
          <span>{formatDatetime(candidate.created_at)}</span>
        </div>

        <div className="border-t pt-4 space-y-3">
          <h3 className="text-sm font-medium">考生標籤</h3>
          <TagMultiSelect
            value={tags}
            onChange={(nextTags) => {
              setTags(nextTags)
              setTagsSuccess(false)
            }}
            label=""
            containerId="candidate-detail-tags"
          />
          {tagsError && (
            <p className="text-sm font-medium text-destructive">{tagsError}</p>
          )}
          {tagsSuccess && (
            <p className="text-sm text-green-600">標籤已儲存</p>
          )}
          <div className="flex items-center gap-3">
            <Button
              type="button"
              size="sm"
              disabled={!tagsDirty || tagsSaving}
              onClick={handleSaveTags}
            >
              {tagsSaving ? '儲存中…' : '儲存標籤'}
            </Button>
            {tagsDirty && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={tagsSaving}
                onClick={() => {
                  setTags(savedTags)
                  setTagsError(null)
                  setTagsSuccess(false)
                }}
              >
                取消變更
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Render exams sub-section
  const renderExams = () => {
    if (examsLoading) {
      return (
        <div className="flex justify-center items-center py-10">
          <LoadingSpinner size="md" />
        </div>
      )
    }
    if (examsError) {
      return <p className="text-sm text-destructive">{examsError}</p>
    }
    if (candidateExams.length === 0) {
      return (
        <p className="text-center text-muted-foreground py-10">尚無考試紀錄</p>
      )
    }
    return (
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">考試標題</th>
              <th className="px-4 py-3 text-left font-medium">狀態</th>
              <th className="px-4 py-3 text-left font-medium">時長（分鐘）</th>
              <th className="px-4 py-3 text-left font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {candidateExams.map((exam) => (
              <tr key={exam.id} className="border-t hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium">{exam.title}</td>
                <td className="px-4 py-3">
                  <ExamStatusBadge status={exam.status} />
                </td>
                <td className="px-4 py-3">{exam.duration_minutes}</td>
                <td className="px-4 py-3">
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/interviewer/exams/${exam.id}`}>查看考試</Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* 返回連結 */}
      <Link
        to="/interviewer/candidates"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        ← 返回考生列表
      </Link>

      {/* 考生資料 */}
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">考生資料</h1>
        {renderProfile()}
      </section>

      {/* 該考生的考試列表 */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">考試列表</h2>
        {renderExams()}
      </section>
    </div>
  )
}
