// Bug 6 Layer 2 — Markdown typography 與 KaTeX 渲染
// 症狀：題目敘述 `# 標題` / `**粗體**` / `$\frac{a}{b}$` 顯示為 raw markdown 字串
// 期望：分別變成 <h1> / <strong> / .katex 元素
//
// 修法：tailwind 加 @tailwindcss/typography plugin (prose 才會 style)、
//        MarkdownView 加 remark-gfm + remark-math + rehype-katex plugin set
//
// 透過 Questioner ProblemFormPage「預覽」即時驗證：開預覽 → typed markdown → DOM 驗
import { test, expect } from '@playwright/test'

const QUESTIONER = { username: 'demo_questioner', password: 'password123' }

test('Bug 6：Questioner 預覽把 markdown 轉成 h1/h2/strong/li（不留 # 字元）', async ({ page }) => {
  await page.goto('/login')
  await page.locator('#username').fill(QUESTIONER.username)
  await page.locator('#password').fill(QUESTIONER.password)
  await page.getByRole('button', { name: '登入' }).click()
  await page.waitForURL('**/questioner**')

  // 進「新增題目」表單
  await page.goto('/questioner/problems/new')

  // 填基本欄位 + markdown 描述
  await page.locator('#title').fill('Bug 6 typography test')
  await page.locator('#description').fill('# 標題一\n## 標題二\n**粗體**\n- 項目一\n- 項目二')

  // 開預覽
  await page.getByRole('button', { name: /預覽/ }).click()

  // typography plugin + ReactMarkdown 應該渲染 h1/h2/strong/li
  await expect(page.getByRole('heading', { level: 1, name: '標題一' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: '標題二' })).toBeVisible()

  // <strong> 元素
  const strongEl = page.locator('strong', { hasText: '粗體' })
  await expect(strongEl).toBeVisible()

  // <li> 元素
  await expect(page.locator('li', { hasText: '項目一' })).toBeVisible()

  // 原始 markdown 字元 # / ** 不該出現在 textContent 上
  const previewText = await page.locator('div.prose').textContent()
  expect(previewText).not.toMatch(/^# 標題一/m)
  expect(previewText).not.toMatch(/\*\*粗體\*\*/)
})

test('Bug 6：KaTeX inline 數學式 $\\frac{a}{b}$ 渲染成 .katex span', async ({ page }) => {
  await page.goto('/login')
  await page.locator('#username').fill(QUESTIONER.username)
  await page.locator('#password').fill(QUESTIONER.password)
  await page.getByRole('button', { name: '登入' }).click()
  await page.waitForURL('**/questioner**')

  await page.goto('/questioner/problems/new')
  await page.locator('#title').fill('Bug 6 katex test')
  await page.locator('#description').fill('公式：$\\frac{a}{b}$ 結束')

  await page.getByRole('button', { name: /預覽/ }).click()

  // KaTeX 渲染後會有 .katex span
  await expect(page.locator('.katex').first()).toBeVisible({ timeout: 5_000 })

  // 原始 LaTeX 文字（含 $）不應留在 textContent
  const previewText = await page.locator('div.prose').textContent()
  expect(previewText).not.toMatch(/\$\\frac/)
})
