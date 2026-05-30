// Smoke：Interviewer 登入後能進「考試列表」且不爆錯
import { test, expect } from '@playwright/test'

const USER = { username: 'interviewer@nthu.edu.tw', password: 'password123' }

test('Interviewer 登入後進入考試列表頁，內容載入成功', async ({ page }) => {
  await page.goto('/login')
  await page.locator('#username').fill(USER.username)
  await page.locator('#password').fill(USER.password)
  await page.getByRole('button', { name: '登入' }).click()

  await page.waitForURL('**/interviewer**')
  await expect(page.getByRole('heading', { name: '考試列表' })).toBeVisible()

  await expect(page.getByText('載入', { exact: false })).toBeHidden({ timeout: 10_000 })
  await expect(page.getByText('失敗', { exact: false })).toBeHidden()
})
