// Layer 2 regression — HackMD bug #2
// 症狀：Interviewer 建立考試時，時長/各難度題數給超大值會讓頁面崩潰
// 期望：時長、簡單/中等/困難題數欄位都應該有 max 屬性，讓瀏覽器擋下不合理輸入
import { test, expect } from '@playwright/test'

const USER = { username: 'interviewer@nthu.edu.tw', password: 'password123' }

test('Interviewer 建立考試頁：時長/各難度題數欄位有合理上限（max 屬性）', async ({ page }) => {
  await page.goto('/login')
  await page.locator('#username').fill(USER.username)
  await page.locator('#password').fill(USER.password)
  await page.getByRole('button', { name: '登入' }).click()
  await page.waitForURL('**/interviewer**')

  await page.goto('/interviewer/exams/new')
  await expect(page.locator('#duration-minutes')).toBeVisible()

  await expect(page.locator('#duration-minutes')).toHaveAttribute('max', /^\d+$/)
  await expect(page.locator('#easy-count')).toHaveAttribute('max', /^\d+$/)
  await expect(page.locator('#medium-count')).toHaveAttribute('max', /^\d+$/)
  await expect(page.locator('#hard-count')).toHaveAttribute('max', /^\d+$/)
})
