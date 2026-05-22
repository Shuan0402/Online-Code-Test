import { useEffect } from 'react'
import api from '@/lib/api'

/**
 * useOfflineRecovery
 *
 * 頁面冷重啟後的斷線恢復邏輯：
 *
 * 1. 對每道題目嘗試讀取 localStorage `pending:{problemId}`。
 *    若有值 → 直接以該 submissionId 呼叫 onPendingFound，讓呼叫端恢復輪詢。
 *
 * 2. 若沒有 pending 鍵，但考試狀態是 Ongoing → 呼叫
 *    GET /api/v1/submissions/latest?problem_id={id}&exam_id={examId}
 *    若後端回傳非終態的提交 → 同樣呼叫 onPendingFound 讓呼叫端恢復輪詢。
 *
 * @param {Array}  problems     — exam_problems 陣列（每個元素需有 problem_id）
 * @param {string} examId       — 考試 UUID 字串
 * @param {string} examStatus   — 目前考試狀態字串
 * @param {function} onPendingFound — (problemId, submissionId) => void
 */
export function useOfflineRecovery(problems, examId, examStatus, onPendingFound) {
  useEffect(() => {
    if (!problems || problems.length === 0 || !examId) return

    const isOngoing = examStatus === 'Ongoing'

    problems.forEach(async (p) => {
      const pid = p.problem_id
      const raw = localStorage.getItem(`pending:${pid}`)

      if (raw) {
        try {
          const { submissionId } = JSON.parse(raw)
          if (submissionId) {
            onPendingFound(pid, submissionId)
          }
        } catch {
          // JSON 格式損壞就清掉
          localStorage.removeItem(`pending:${pid}`)
        }
        return
      }

      // 沒有 pending 鍵，但考試進行中 → 嘗試從後端取最新提交
      if (isOngoing) {
        try {
          const res = await api.get('/api/v1/submissions/latest', {
            params: { problem_id: pid, exam_id: examId }
          })
          const sub = res.data
          // 只對非終態的提交恢復輪詢
          if (sub && (sub.status === 'Pending' || sub.status === 'Judging')) {
            // 重新寫入 pending 鍵，方便下次冷重啟
            localStorage.setItem(`pending:${pid}`, JSON.stringify({ submissionId: sub.id, ts: Date.now() }))
            onPendingFound(pid, sub.id)
          }
        } catch {
          // 404 或網路錯誤 — 該題目確實沒有進行中的提交，忽略
        }
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]) // 只在 examId 確定後執行一次
}
