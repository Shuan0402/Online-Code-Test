/**
 * Tests for MarkdownView — Bug 6 共用 markdown 元件。
 *
 * 覆蓋場景：
 * (a) 基本 markdown：headings / bold / lists 正確 parse
 * (b) GFM 表格 → <table><tr><td>
 * (c) KaTeX inline 數學式 `$...$` → 渲染 .katex span（不留原始 `$`）
 * (d) 空字串 / null 不會 crash
 */

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import MarkdownView from './MarkdownView'

describe('MarkdownView', () => {
  it('renders basic markdown (headings, bold, lists)', () => {
    render(
      <MarkdownView>
        {'# 標題一\n## 標題二\n**粗體**\n- A\n- B'}
      </MarkdownView>
    )
    expect(screen.getByRole('heading', { level: 1, name: '標題一' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '標題二' })).toBeInTheDocument()
    expect(screen.getByText('粗體').tagName).toBe('STRONG')
    expect(screen.getByText('A').tagName).toBe('LI')
  })

  it('renders GFM tables (remark-gfm plugin)', () => {
    const md = `| 欄位 | 值 |\n|------|------|\n| a | 1 |\n| b | 2 |`
    const { container } = render(<MarkdownView>{md}</MarkdownView>)
    expect(container.querySelector('table')).toBeInTheDocument()
    expect(container.querySelectorAll('td').length).toBe(4)
  })

  it('renders inline LaTeX with KaTeX (remark-math + rehype-katex)', () => {
    const { container } = render(<MarkdownView>{'公式：$\\frac{a}{b}$'}</MarkdownView>)
    // KaTeX 會輸出 .katex span class、且原始 `$...$` 不應出現在純文字
    expect(container.querySelector('.katex')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\$\\frac/)
  })

  it('handles empty / null children without crashing', () => {
    const { container: c1 } = render(<MarkdownView>{''}</MarkdownView>)
    expect(c1.firstChild).not.toBeNull()  // wrapper div 還在、只是內容空

    const { container: c2 } = render(<MarkdownView>{null}</MarkdownView>)
    expect(c2.firstChild).not.toBeNull()
  })
})
