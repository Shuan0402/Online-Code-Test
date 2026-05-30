// L2 regression：Candidate 角色的反例路徑（HackMD user story A1 反例 / A2 / A3）
//
// 不依賴特定考試資料，只測「未登入、錯帳密、越權」三條共用守衛。
// 需要的種子：demo_candidate / password123（happy-path 已用）。
import { test, expect } from '@playwright/test'

const CANDIDATE = { username: 'demo_candidate', password: 'password123' }

// ── US-A3：未登入訪問受保護頁 → 自動踢回 /login ─────────────────────────────
test('未登入訪問 /candidate/exams 會被導去登入頁', async ({ page, context }) => {
  await context.clearCookies()
  await page.goto('/candidate/exams')

  await page.waitForURL('**/login')
  await expect(page.getByRole('button', { name: '登入' })).toBeVisible()
})

// ── US-A1 反例：錯誤帳密 → 顯示錯誤訊息、停在 /login ────────────────────────
test('用錯誤帳密登入會看到錯誤訊息且不離開登入頁', async ({ page }) => {
  await page.goto('/login')
  await page.locator('#username').fill(CANDIDATE.username)
  await page.locator('#password').fill('wrong-password')
  await page.getByRole('button', { name: '登入' }).click()

  await expect(page.getByText('帳號或密碼錯誤，請重新確認。')).toBeVisible()
  expect(page.url()).toContain('/login')
})

// ── US-A2：Candidate 角色被擋在管理後台之外（→ /unauthorized） ──────────────
test('Candidate 不能進入 staff 路由', async ({ page }) => {
  // 先正常登入拿到 candidate token
  await page.goto('/login')
  await page.locator('#username').fill(CANDIDATE.username)
  await page.locator('#password').fill(CANDIDATE.password)
  await page.getByRole('button', { name: '登入' }).click()
  await page.waitForURL('**/candidate/exams')

  // 逐一試三個 staff 路由
  for (const path of ['/questioner', '/interviewer', '/admin']) {
    await page.goto(path)
    await page.waitForURL('**/unauthorized')
    await expect(page.getByRole('heading', { name: '權限不足' })).toBeVisible()
  }
})
