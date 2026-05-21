import { useEffect, useRef, useCallback } from 'react'
import api from '@/lib/api'

/**
 * 自適應輪詢延遲陣列（模組層級常數，不隨 re-render 重建）。
 *
 * 設計理由：評測剛送出時最需要即時回應，後期若還未出結果多半是 TLE/MLE 大題
 * ——拉長間隔可省下約 70% 的請求次數，相比固定 1s 輪詢更節省後端資源。
 *
 * 索引 0..8：300ms → 500ms → 1s → 2s → 3s → 5s × 4 → 10s（後續維持 10s）
 */
const POLLING_DELAYS = [300, 500, 1000, 2000, 3000, 5000, 5000, 5000, 10000]

/**
 * 終止態判斷：只要不是 Pending 且不是 Judging，就算已完成。
 */
function isTerminal(status) {
  return status !== 'Pending' && status !== 'Judging'
}

/**
 * useAdaptivePolling
 *
 * @param {string|null} submissionId — 要輪詢的提交 UUID；傳 null 表示不啟動
 * @param {function} onResult — 當取得結果時呼叫，傳入完整 SubmissionRead 物件
 */
export function useAdaptivePolling(submissionId, onResult) {
  const timerRef = useRef(null)
  const delayIndexRef = useRef(0)
  const activeIdRef = useRef(submissionId)
  const onResultRef = useRef(onResult)

  // 保持 onResult 參考最新，避免 stale closure
  useEffect(() => {
    onResultRef.current = onResult
  })

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const poll = useCallback(async () => {
    const id = activeIdRef.current
    if (!id) return

    try {
      const res = await api.get(`/api/v1/submissions/${id}`)
      const data = res.data
      onResultRef.current(data)

      if (isTerminal(data.status)) {
        stopPolling()
        return
      }
    } catch (err) {
      // 網路錯誤時繼續輪詢（沿用目前延遲索引）
      console.warn(
        '[useAdaptivePolling] 輪詢失敗，稍後重試',
        err?.response?.status,
      )
    }

    // 選出下一個延遲，超過陣列末端就固定使用最後值
    const nextDelayIdx = Math.min(
      delayIndexRef.current + 1,
      POLLING_DELAYS.length - 1,
    )
    delayIndexRef.current = nextDelayIdx
    timerRef.current = setTimeout(poll, POLLING_DELAYS[nextDelayIdx])
  }, [stopPolling])

  useEffect(() => {
    activeIdRef.current = submissionId
    stopPolling()
    delayIndexRef.current = 0

    if (!submissionId) return

    // 第一次立即以 POLLING_DELAYS[0] 延遲執行
    timerRef.current = setTimeout(poll, POLLING_DELAYS[0])

    return () => stopPolling()
  }, [submissionId, poll, stopPolling])

  return { stopPolling }
}
