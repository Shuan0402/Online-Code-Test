/**
 * LoadingSpinner — 通用讀取中動畫
 *
 * 用法：<LoadingSpinner /> 或 <LoadingSpinner size="sm" />
 * size: 'sm' | 'md' (預設) | 'lg'
 */
export default function LoadingSpinner({ size = 'md' }) {
  const sizeClass = {
    sm: 'h-5 w-5 border-2',
    md: 'h-8 w-8 border-2',
    lg: 'h-12 w-12 border-4',
  }[size] ?? 'h-8 w-8 border-2'

  return (
    <div
      role="status"
      aria-label="載入中"
      className={`inline-block rounded-full border-muted border-t-primary animate-spin ${sizeClass}`}
    />
  )
}
