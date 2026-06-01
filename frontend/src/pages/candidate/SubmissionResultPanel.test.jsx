/**
 * Tests for SubmissionResultPanel (Bug 1: Candidate WA 對比顯示).
 *
 * SubmissionResultPanel 是 TakeExamPage 內的「最新提交 testcase 詳情」面板，
 * 在考試進行中顯示給 candidate 看：每筆 sample testcase 的 runtime_info
 * （worker 寫的 Expected/Got 對比）。
 *
 * 覆蓋場景：
 * (a) result === null → renders nothing (returns null)
 * (b) details === [] → renders nothing
 * (c) details with runtime_info → table renders runtime_info content in <pre>
 * (d) details with null runtime_info → 該列「詳細資訊」欄秀「—」
 * (e) WA + Expected/Got 訊息 → 文字正確渲染
 * (f) result.failure_reason → 額外秀「系統錯誤訊息」區塊
 */

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { SubmissionResultPanel, pickFresher } from './TakeExamPage'

describe('SubmissionResultPanel', () => {
  // (a) null guard — 提交前顯示 placeholder（讓考生知道結果會出現在這）
  it('shows placeholder text when result is null (not invisible)', () => {
    render(<SubmissionResultPanel result={null} />)
    expect(screen.getByText(/testcase 結果會顯示在這/i)).toBeInTheDocument()
  })

  // (b) empty details guard — 評測中 placeholder
  it('shows 「評測中…」 placeholder when details array is empty', () => {
    render(<SubmissionResultPanel result={{ id: 's1', details: [] }} />)
    expect(screen.getByText('評測中…')).toBeInTheDocument()
  })

  // (c) runtime_info content shown in <pre>
  it('renders each testcase row with runtime_info content', () => {
    const result = {
      id: 's1',
      details: [
        {
          id: 1,
          status: 'WrongAnswer',
          execution_time: 18,
          runtime_info: 'Expected: 7\nGot: 6',
        },
        {
          id: 2,
          status: 'Accepted',
          execution_time: 22,
          runtime_info: null,
        },
      ],
    }
    render(<SubmissionResultPanel result={result} />)

    // Header
    expect(screen.getByText('最新提交 Testcase 明細')).toBeInTheDocument()

    // runtime_info content (WA 對比)
    expect(screen.getByText(/Expected: 7/)).toBeInTheDocument()
    expect(screen.getByText(/Got: 6/)).toBeInTheDocument()
  })

  // (d) null runtime_info → 「—」
  it('shows em-dash for testcases whose runtime_info is null', () => {
    const result = {
      id: 's1',
      details: [
        { id: 1, status: 'Accepted', execution_time: 10, runtime_info: null },
      ],
    }
    render(<SubmissionResultPanel result={result} />)

    // —— should be the placeholder in the "詳細資訊" column
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
  })

  // (e) CE 的 stderr 訊息渲染
  it('renders CE stderr message verbatim', () => {
    const result = {
      id: 's1',
      details: [
        {
          id: 1,
          status: 'CompilationError',
          execution_time: 0,
          runtime_info: 'SyntaxError: invalid syntax\n  File "main.py", line 3',
        },
      ],
    }
    render(<SubmissionResultPanel result={result} />)

    expect(screen.getByText(/SyntaxError: invalid syntax/)).toBeInTheDocument()
  })

  // (f) judge_failure_reason 區塊
  it('renders failure_reason block when present', () => {
    const result = {
      id: 's1',
      details: [
        { id: 1, status: 'Accepted', execution_time: 10, runtime_info: '' },
      ],
      failure_reason: 'Sandbox crashed: docker pull failed',
    }
    render(<SubmissionResultPanel result={result} />)

    expect(screen.getByText('系統錯誤訊息：')).toBeInTheDocument()
    expect(screen.getByText(/Sandbox crashed/)).toBeInTheDocument()
  })

  // RUN_ONLY badge — submission_type='RUN_ONLY' 時應顯示「試跑」badge + 不同 header 標題
  it('RUN_ONLY 試跑：header 含「試跑」badge 與「不計分」字樣', () => {
    const result = {
      id: 's1',
      submission_type: 'RUN_ONLY',
      details: [
        { id: 1, status: 'WrongAnswer', execution_time: 10, runtime_info: 'Expected: 8\nGot: 7' },
      ],
    }
    render(<SubmissionResultPanel result={result} />)
    expect(screen.getByText('試跑')).toBeInTheDocument()
    expect(screen.getByText(/試跑 Testcase 明細（不計分）/)).toBeInTheDocument()
  })

  it('OFFICIAL 提交：不應顯示「試跑」badge', () => {
    const result = {
      id: 's1',
      submission_type: 'OFFICIAL',
      details: [
        { id: 1, status: 'Accepted', execution_time: 10, runtime_info: '' },
      ],
    }
    render(<SubmissionResultPanel result={result} />)
    expect(screen.queryByText('試跑')).toBeNull()
    expect(screen.getByText('最新提交 Testcase 明細')).toBeInTheDocument()
  })

  // pickFresher 邏輯：兩個結果都存在時、依 created_at 取較新
  it('pickFresher：較新的 created_at 勝出', () => {
    const older = { id: 'a', created_at: '2026-06-01T10:00:00Z' }
    const newer = { id: 'b', created_at: '2026-06-01T10:05:00Z' }
    expect(pickFresher(older, newer).id).toBe('b')
    expect(pickFresher(newer, older).id).toBe('b')
  })

  it('pickFresher：另一邊為 null 時回對的那個', () => {
    const result = { id: 'a', created_at: '2026-06-01T10:00:00Z' }
    expect(pickFresher(null, result)).toBe(result)
    expect(pickFresher(result, null)).toBe(result)
    expect(pickFresher(null, null)).toBe(null)
  })

  // (g) execution_time null → 「—」
  it('shows em-dash for null execution_time', () => {
    const result = {
      id: 's1',
      details: [
        { id: 1, status: 'Pending', execution_time: null, runtime_info: null },
      ],
    }
    render(<SubmissionResultPanel result={result} />)

    // 兩個 — 一個是 execution_time 一個是 runtime_info
    expect(screen.getAllByText('—').length).toBe(2)
  })
})
