/**
 * Tests for ProblemPanel — Bug 6 markdown 渲染驗證。
 *
 * 目標：證明 ReactMarkdown 真的把 `# 標題` parse 成 <h1>、`**` 變 <strong>、`-` 變 <ul>。
 * 如果這條過、表示組件邏輯 OK、screenshot 顯示 raw md 必為 styling (typography plugin) 或 data 問題。
 */

import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/api', () => ({
  default: { get: vi.fn() },
}))

vi.mock('@/components/LoadingSpinner', () => ({
  default: () => <div data-testid="loading-spinner" />,
}))

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }) => <span>{children}</span>,
}))

import api from '@/lib/api'
import ProblemPanel from './ProblemPanel'

const MOCK_PROBLEM = {
  id: 1,
  title: '範例題',
  difficulty: 'Easy',
  time_limit_ms: 1000,
  memory_limit_mb: 256,
  description: '# 標題一\n## 標題二\n**粗體**\n- 項目一\n- 項目二',
  test_cases: [],
}

describe('ProblemPanel markdown render', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: MOCK_PROBLEM })
  })

  it('renders markdown headings as <h1>/<h2> (not raw "# ...")', async () => {
    render(<ProblemPanel problemId={1} points={100} sequence={1} />)

    // 等 api 解析完
    await screen.findByText('標題一')

    // 不能看到原始 # 符號
    const wholeText = document.body.textContent
    expect(wholeText).not.toMatch(/^# 標題一/m)
    expect(wholeText).not.toMatch(/## 標題二/)

    // 應該有真正的 h1 / h2 標籤
    expect(screen.getByRole('heading', { level: 1, name: '標題一' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '標題二' })).toBeInTheDocument()
  })

  it('renders **bold** as <strong>', async () => {
    render(<ProblemPanel problemId={1} points={100} sequence={1} />)
    await screen.findByText('粗體')
    const strongEl = screen.getByText('粗體')
    expect(strongEl.tagName).toBe('STRONG')
  })

  it('renders bullet list with <ul><li>', async () => {
    render(<ProblemPanel problemId={1} points={100} sequence={1} />)
    await screen.findByText('項目一')
    const item = screen.getByText('項目一')
    expect(item.tagName).toBe('LI')
  })
})
