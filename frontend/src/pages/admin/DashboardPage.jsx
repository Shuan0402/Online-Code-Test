import { useState, useEffect } from 'react'
import api from '@/lib/api'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

// ExamStatus enum values (capitalized)
const EXAM_STATUSES = ['Draft', 'Published', 'Ongoing', 'Finished', 'Archived']
// JudgeStatus enum values (capitalized)
const JUDGE_STATUSES = [
  'Pending',
  'Judging',
  'AC',
  'WA',
  'TLE',
  'MLE',
  'RE',
  'CE',
]
// UserRole enum values (capitalized)
const USER_ROLES = ['Admin', 'Candidate', 'Interviewer', 'Questioner']

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [exams, setExams] = useState([])
  // NOTE: GET /api/v1/submissions/ returns all submissions with no limit.
  // A ?limit= query param could be added here if performance becomes an issue.
  const [submissions, setSubmissions] = useState([])
  const [users, setUsers] = useState([])

  useEffect(() => {
    async function fetchAll() {
      setLoading(true)
      setError(null)
      try {
        const [examsRes, subsRes, usersRes] = await Promise.all([
          api.get('/api/v1/exams/'),
          api.get('/api/v1/submissions/'),
          api.get('/api/v1/users/'),
        ])
        setExams(examsRes.data)
        setSubmissions(subsRes.data)
        setUsers(usersRes.data)
      } catch (err) {
        setError(err?.response?.data?.detail || '載入儀表板資料失敗')
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [])

  const grafanaUrl = import.meta.env.VITE_GRAFANA_URL

  // Count helpers
  function countBy(arr, key, value) {
    return arr.filter((item) => item[key] === value).length
  }

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={error} />

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">儀表板</h1>
        {grafanaUrl && (
          <a
            href={grafanaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-4 py-2 rounded-md bg-orange-500 text-white text-sm font-medium hover:bg-orange-600"
          >
            系統監控 (Grafana)
          </a>
        )}
      </div>

      {/* 考試統計 */}
      <Card>
        <CardHeader>
          <CardTitle>考試統計</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold mb-4">考試總數：{exams.length}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
            {EXAM_STATUSES.map((status) => (
              <div key={status} className="rounded-md border p-3 text-center">
                <p className="text-sm text-muted-foreground">{status}</p>
                <p className="text-xl font-semibold">
                  {countBy(exams, 'status', status)}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 提交統計 */}
      <Card>
        <CardHeader>
          <CardTitle>提交統計</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold mb-4">
            提交總數：{submissions.length}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {JUDGE_STATUSES.map((status) => (
              <div key={status} className="rounded-md border p-3 text-center">
                <p className="text-sm text-muted-foreground">{status}</p>
                <p className="text-xl font-semibold">
                  {countBy(submissions, 'status', status)}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 成員統計 */}
      <Card>
        <CardHeader>
          <CardTitle>成員統計</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold mb-4">成員總數：{users.length}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {USER_ROLES.map((role) => (
              <div key={role} className="rounded-md border p-3 text-center">
                <p className="text-sm text-muted-foreground">{role}</p>
                <p className="text-xl font-semibold">
                  {countBy(users, 'role', role)}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
