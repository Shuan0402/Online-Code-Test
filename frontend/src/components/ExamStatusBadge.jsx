import { Badge } from '@/components/ui/badge'

// Maps backend ExamStatus enum values to Chinese labels and badge variants/colours.
const STATUS_CONFIG = {
  Draft: {
    label: '草稿',
    className: 'bg-gray-200 text-gray-700 hover:bg-gray-200',
  },
  Published: {
    label: '已發佈',
    className: 'bg-blue-500 text-white hover:bg-blue-500',
  },
  Ongoing: {
    label: '進行中',
    className: 'bg-green-500 text-white hover:bg-green-500',
  },
  Finished: {
    label: '已結束',
    className: 'bg-orange-400 text-white hover:bg-orange-400',
  },
  Archived: {
    label: '已封存',
    className: 'bg-gray-500 text-white hover:bg-gray-500',
  },
}

/**
 * ExamStatusBadge — renders a coloured badge for an ExamStatus enum value.
 * @param {{ status: string }} props
 */
export default function ExamStatusBadge({ status }) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    className: 'bg-gray-300 text-gray-700',
  }
  return <Badge className={config.className}>{config.label}</Badge>
}
