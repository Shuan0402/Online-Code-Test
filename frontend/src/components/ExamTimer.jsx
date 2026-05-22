import { useEffect, useRef, useState } from 'react'

/**
 * ExamTimer
 *
 * @param {number}   initialSeconds — 由後端 remaining_seconds 決定，單位秒
 * @param {function} onTimeout      — 倒數歸零時呼叫（觸發自動交卷流程）
 */
export default function ExamTimer({ initialSeconds, onTimeout }) {
  const [remaining, setRemaining] = useState(initialSeconds ?? 0)
  const onTimeoutRef = useRef(onTimeout)
  const firedRef = useRef(false)
  // Hold the single interval id so we can clear it on unmount or reset.
  // Using a ref ensures we never create more than one interval at a time.
  const intervalRef = useRef(null)

  // 保持 onTimeout 參考最新（不加入 effect deps，避免每次渲染重啟計時器）
  useEffect(() => {
    onTimeoutRef.current = onTimeout
  })

  // 當 initialSeconds 改變（例如 start API 回傳後才掛載）時重置倒數。
  // The countdown effect below depends only on [initialSeconds], so changing
  // initialSeconds also tears down the old interval and starts a fresh one.
  useEffect(() => {
    if (initialSeconds != null) {
      setRemaining(initialSeconds)
      firedRef.current = false
    }
  }, [initialSeconds])

  // Single interval for the entire countdown lifetime.
  // Depends only on [initialSeconds] — NOT on [remaining] — so React never
  // tears down and recreates the interval on each tick (which would cause N
  // short-lived intervals running simultaneously).
  // We use the functional-updater form of setRemaining so the callback always
  // sees the latest value without needing `remaining` as a dependency.
  useEffect(() => {
    if (initialSeconds == null || initialSeconds <= 0) return

    // Clear any previous interval (e.g., from a prior initialSeconds value)
    if (intervalRef.current) clearInterval(intervalRef.current)

    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
          if (!firedRef.current) {
            firedRef.current = true
            onTimeoutRef.current?.()
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSeconds])

  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  const isWarning = remaining < 5 * 60 // 少於 5 分鐘時紅字警示

  return (
    <div
      className={`font-mono text-xl font-bold tabular-nums ${
        isWarning ? 'text-red-600 animate-pulse' : 'text-foreground'
      }`}
      aria-label={`剩餘時間 ${display}`}
    >
      ⏱ {display}
    </div>
  )
}
