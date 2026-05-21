import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'

import api from '@/lib/api'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
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

export default function CandidateListPage() {
  const navigate = useNavigate()

  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchCandidates = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get('/api/v1/users/')
      // 只顯示 role === 'Candidate' 的帳號
      setCandidates(res.data.filter((u) => u.role === 'Candidate'))
    } catch (err) {
      setError(err.response?.data?.detail ?? '載入考生列表失敗，請稍後再試')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCandidates()
  }, [fetchCandidates])

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <ErrorMessage message={error} onRetry={fetchCandidates} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      {/* 頁首：標題 + 新增按鈕 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">考生管理</h1>
        <Button onClick={() => navigate('/interviewer/candidates/new')}>
          新增考生
        </Button>
      </div>

      {/* 考生列表 */}
      {candidates.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">目前沒有考生</p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">考生姓名</th>
                <th className="px-4 py-3 text-left font-medium">考生帳號</th>
                <th className="px-4 py-3 text-left font-medium w-44">
                  建立時間
                </th>
                <th className="px-4 py-3 text-left font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate) => (
                <tr
                  key={candidate.id}
                  className="border-t hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3 font-medium">
                    {candidate.full_name ?? candidate.username}
                  </td>
                  <td className="px-4 py-3">{candidate.username}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDatetime(candidate.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/interviewer/candidates/${candidate.id}`}>
                        查看
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 說明：刪除操作需由管理員執行 */}
      <p className="text-xs text-muted-foreground">
        刪除考生帳號需由管理員操作
      </p>
    </div>
  )
}
