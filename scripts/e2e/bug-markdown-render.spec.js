// Layer 2 regression — HackMD bug #4
// 症狀：題目敘述用 Markdown 寫，但前端 (Candidate / Questioner) 沒渲染，顯示成純文字
// 期望：description 中的 markdown 語法應該被渲染（例如 inline code `3 5` 變成 <code> 元素）
//
// 用 Candidate 端的考試頁驗證，因為敘述渲染元件 (ProblemPanel) 是兩個 role 共用
import { test, expect } from '@playwright/test'

const USER = { username: 'demo_candidate', password: 'password123' }

test('Candidate 看到的題目敘述會渲染 Markdown（例如 inline code）', async ({ page }) => {
  await page.goto('/login')
  await page.locator('#username').fill(USER.username)
  await page.locator('#password').fill(USER.password)
  await page.getByRole('button', { name: '登入' }).click()
  await page.waitForURL('**/candidate/exams')

  const card = page.locator('div.border.rounded-lg').filter({ hasText: 'E2E 進行中考試' })
  await card.getByRole('button', { name: '開始作答' }).click()
  await page.getByRole('button', { name: '確認開始' }).click()
  await page.waitForURL('**/candidate/exams/*/take')

  // demo seed 的題目敘述有 backtick：「例如：輸入 `3 5`，輸出 `8`」
  // 渲染正確時，3 5 跟 8 會在 <code> 標籤裡
  await expect(page.locator('code', { hasText: '3 5' })).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('code', { hasText: '8' })).toBeVisible()
})
