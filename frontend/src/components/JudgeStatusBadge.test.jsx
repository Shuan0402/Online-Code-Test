/**
 * Tests for JudgeStatusBadge component.
 *
 * Step 9 重點：
 * - JudgeFailed 對 user 顯示「系統異常，請重新提交」、不洩漏內部錯誤 (failure_reason 是
 *   admin only、不傳到此 component)
 * - 其他既有 status 維持原樣
 */

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import JudgeStatusBadge from './JudgeStatusBadge'

describe('JudgeStatusBadge', () => {
  it('renders AC verdict label', () => {
    render(<JudgeStatusBadge status="AC" />)
    expect(screen.getByText('AC')).toBeInTheDocument()
  })

  it('renders Pending as 評判中', () => {
    render(<JudgeStatusBadge status="Pending" />)
    expect(screen.getByText('評判中')).toBeInTheDocument()
  })

  it('renders JudgeFailed as 系統異常請重新提交 (Step 9)', () => {
    render(<JudgeStatusBadge status="JudgeFailed" />)
    expect(screen.getByText('系統異常，請重新提交')).toBeInTheDocument()
  })

  it('JudgeFailed badge does NOT expose any internal error details', () => {
    const { container } = render(<JudgeStatusBadge status="JudgeFailed" />)
    // 整個 badge 文字應僅有 user-facing label、不含技術細節
    const text = container.textContent
    expect(text).toBe('系統異常，請重新提交')
    expect(text).not.toMatch(/Error|Exception|Traceback|sandbox|docker/i)
  })

  it('falls back to raw status string for unknown values', () => {
    render(<JudgeStatusBadge status="UnknownStatus" />)
    expect(screen.getByText('UnknownStatus')).toBeInTheDocument()
  })
})
