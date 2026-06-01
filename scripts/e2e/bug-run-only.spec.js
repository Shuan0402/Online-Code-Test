// RUN_ONLY 試跑 Layer 2 — 試跑按鈕 + 結果共用 panel + 不影響 tab 狀態 + 5s cooldown
//
// 流程：candidate 進考試 → 寫故意打錯的 code → 點「試跑」→ panel 出現「試跑」badge、
//        sample testcase 有 Expected/Got、hidden testcase runtime_info 被 mask、
//        tab 狀態仍是「未提交」（試跑不影響）；連按兩次第二次收到 429。
import { test, expect } from '@playwright/test'

const USER = { username: 'demo_candidate', password: 'password123' }

async function loginAndEnterExam(page) {
  await page.goto('/login')
  await page.locator('#username').fill(USER.username)
  await page.locator('#password').fill(USER.password)
  await page.getByRole('button', { name: '登入' }).click()
  await page.waitForURL('**/candidate/exams')

  const card = page.locator('div.border.rounded-lg').filter({ hasText: 'E2E 進行中考試' })
  await card.getByRole('button', { name: '開始作答' }).click()
  await page.getByRole('button', { name: '確認開始' }).click()
  await page.waitForURL('**/candidate/exams/*/take')

  await expect(page.getByRole('combobox')).toBeVisible({ timeout: 10_000 })
}

test('RUN_ONLY：試跑顯示結果 panel、不污染 tab、5s cooldown 429', async ({ page }) => {
  await loginAndEnterExam(page)

  // 點試跑（沿用 EditorPanel 預設的 Python 範本就行、輸出空字串會 WA）
  const runBtn = page.getByRole('button', { name: '試跑' })
  await runBtn.click()

  // 1) panel header 出現（這串文字只有 panel 才有、不會跟按鈕撞）
  await expect(page.getByText(/試跑 Testcase 明細（不計分）/)).toBeVisible({ timeout: 30_000 })

  // 2) 「試跑」badge 在 panel header（amber 樣式 span）
  await expect(page.locator('span.bg-amber-100', { hasText: '試跑' })).toBeVisible()

  // 3) tab 狀態不該變成「已提交」/「答對」等 — 應該保持「未提交」
  const tab = page.locator('button[data-problem-id]').first()
  await expect(tab.getByText('未提交')).toBeVisible()

  // 4) 立刻再按一次（5 秒內、必撞 cooldown） → banner 顯示「太頻繁」
  await runBtn.click()
  await expect(page.getByText(/太頻繁/)).toBeVisible({ timeout: 5_000 })
})
