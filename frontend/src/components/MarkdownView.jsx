import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

/**
 * MarkdownView — 全站統一的題目敘述 / 程式碼說明 markdown 渲染元件。
 *
 * Bug 6：所有 ReactMarkdown 點都該過這支元件、確保：
 *   - remark-gfm：支援 GFM（表格、刪除線、自動連結、task list）
 *   - remark-math + rehype-katex：支援 `$...$` 與 `$$...$$` LaTeX 數學式
 *   - 外層 `prose` class 由 @tailwindcss/typography 套標題 / 列表 / 粗體樣式
 *
 * @param {string} children — 要渲染的 markdown 原始字串
 * @param {string} className — 額外的 wrapper className（會疊在 prose 之外）
 */
export default function MarkdownView({ children, className = '' }) {
  return (
    <div className={`prose prose-sm max-w-none ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {children ?? ''}
      </ReactMarkdown>
    </div>
  )
}
