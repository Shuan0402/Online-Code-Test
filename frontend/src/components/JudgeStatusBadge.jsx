/**
 * JudgeStatusBadge — 評測狀態顏色標籤
 *
 * 支援的值：Pending, Judging, AC, WA, TLE, MLE, RE, CE, Unsubmitted
 *
 * @param {string} status — JudgeStatus 字串或 "Unsubmitted"
 */

const STATUS_LABEL = {
  Pending:     '評判中',
  Judging:     '評判中',
  AC:          'AC',
  WA:          'WA',
  TLE:         'TLE',
  MLE:         'MLE',
  RE:          'RE',
  CE:          'CE',
  Unsubmitted: '未提交',
}

const STATUS_CLASS = {
  AC:          'bg-green-500 text-white',
  WA:          'bg-red-500 text-white',
  TLE:         'bg-orange-500 text-white',
  MLE:         'bg-orange-400 text-white',
  RE:          'bg-red-400 text-white',
  CE:          'bg-yellow-500 text-white',
  Pending:     'bg-blue-400 text-white',
  Judging:     'bg-blue-500 text-white animate-pulse',
  Unsubmitted: 'bg-gray-200 text-gray-600',
}

export default function JudgeStatusBadge({ status }) {
  const label = STATUS_LABEL[status] ?? status
  const cls = STATUS_CLASS[status] ?? 'bg-gray-200 text-gray-600'

  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {label}
    </span>
  )
}
