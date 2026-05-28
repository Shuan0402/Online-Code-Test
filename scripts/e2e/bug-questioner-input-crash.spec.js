// Layer 2 regression — HackMD bug #1
// 症狀：Questioner 建立題目時，時間/記憶體限制給超大值會讓頁面崩潰
// 期望：時間限制 / 記憶體限制欄位應該有 max 屬性（HTML5 native 驗證），讓瀏覽器在送出前擋下
import { test, expect } from '@playwright/test'

const USER = { username: 'demo_questioner', password: 'password123' }

test('Questioner 建立題目頁：時間/記憶體限制欄位有合理上限（max 屬性）', async ({ page }) => {
  await page.goto('/login')
  await page.locator('#username').fill(USER.username)
  await page.locator('#password').fill(USER.password)
  await page.getByRole('button', { name: '登入' }).click()
  await page.waitForURL('**/questioner**')

  await page.goto('/questioner/problems/new')
  await expect(page.locator('#time-limit')).toBeVisible()

  // 期望：兩個 number 欄位都有 max 屬性，且是合理整數
  await expect(page.locator('#time-limit')).toHaveAttribute('max', /^\d+$/)
  await expect(page.locator('#memory-limit')).toHaveAttribute('max', /^\d+$/)
})
