// Smoke：Admin 登入後能進「儀表板」且資料載入成功
import { test, expect } from '@playwright/test'

const USER = { username: 'admin@nthu.edu.tw', password: 'password123' }

test('Admin 登入後進入儀表板，三組統計都載入成功', async ({ page }) => {
  await page.goto('/login')
  await page.locator('#username').fill(USER.username)
  await page.locator('#password').fill(USER.password)
  await page.getByRole('button', { name: '登入' }).click()

  await page.waitForURL('**/admin**')
  await expect(page.getByRole('heading', { name: '儀表板' })).toBeVisible()

  await expect(page.getByText('載入', { exact: false })).toBeHidden({ timeout: 10_000 })
  await expect(page.getByText('失敗', { exact: false })).toBeHidden()
})
