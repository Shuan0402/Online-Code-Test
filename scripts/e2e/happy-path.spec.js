// Frontend happy path：candidate 登入 → 進考試 → 提交「兩數相加」正解 → 等到 AC
import { test, expect } from '@playwright/test'

const CANDIDATE = { username: 'demo_candidate', password: 'password123' }
const SOURCE = `a, b = map(int, input().split())\nprint(a + b)`

test('candidate 透過前端送 happy path 拿到 AC', async ({ page }) => {
  // ── 1. 登入 ────────────────────────────────────────────────────────────
  await page.goto('/login')
  await page.locator('#username').fill(CANDIDATE.username)
  await page.locator('#password').fill(CANDIDATE.password)
  await page.getByRole('button', { name: '登入' }).click()

  await page.waitForURL('**/candidate/exams')
  await expect(page.getByRole('heading', { name: '我的考試' })).toBeVisible()

  // ── 2. 點開始作答 → 確認 ──────────────────────────────────────────────
  const startButton = page.getByRole('button', { name: '開始作答' }).first()
  await expect(startButton).toBeVisible({ timeout: 10_000 })
  await startButton.click()
  await page.getByRole('button', { name: '確認開始' }).click()

  await page.waitForURL('**/candidate/exams/*/take')

  // ── 3. 等 Monaco 載入完成（暴露 window.monaco）── ─────────────────────
  await page.waitForFunction(
    () => window.monaco && window.monaco.editor && window.monaco.editor.getEditors().length > 0,
    null,
    { timeout: 20_000 }
  )

  // ── 4. 用 Monaco API 塞入正解，避免 keyboard 觸發 auto-close brackets ─
  await page.evaluate((code) => {
    const editor = window.monaco.editor.getEditors()[0]
    editor.setValue(code)
    // 給 React 一點時間吃 onChange
  }, SOURCE)

  // 視覺確認 code 進去了
  await expect(page.locator('.monaco-editor').first()).toContainText('print(a + b)')

  // ── 5. 提交本題 ─────────────────────────────────────────────────────────
  const submitBtn = page.getByRole('button', { name: /提交本題|提交中/ })
  await submitBtn.click()

  // ── 6. 等 tab 上的徽章變 AC（最久 30s） ────────────────────────────────
  const acBadge = page.locator('button:has-text("題 1") >> text=AC').first()
  await expect(acBadge).toBeVisible({ timeout: 30_000 })

  // ── 7. 截圖留證 ────────────────────────────────────────────────────────
  await page.screenshot({ path: 'artifacts/take-AC.png', fullPage: true })
})
