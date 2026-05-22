import { Button } from '@/components/ui/button'

/**
 * ErrorMessage — 通用錯誤卡片
 *
 * @param {string}   message  — 顯示給使用者的錯誤訊息
 * @param {Function} [onRetry] — 可選；提供時顯示「重試」按鈕並呼叫此函式
 */
export default function ErrorMessage({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-6 py-8 text-center">
      <p className="text-red-600 font-medium">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          重試
        </Button>
      )}
    </div>
  )
}
