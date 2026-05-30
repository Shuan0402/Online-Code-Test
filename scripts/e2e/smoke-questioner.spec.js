// Smoke：Questioner 登入後能進「題目列表」且不爆錯
import { test, expect } from '@playwright/test'

const USER = { username: 'demo_questioner', password: 'password123' }

test('Questioner 登入後進入題目列表頁，內容載入成功', async ({ page }) => {
  await page.goto('/login')
  await page.locator('#username').fill(USER.username)
  await page.locator('#password').fill(USER.password)
  await page.getByRole('button', { name: '登入' }).click()

  await page.waitForURL('**/questioner**')
  await expect(page.getByRole('heading', { name: '題目列表' })).toBeVisible()

  // 內容區不能停在 loading spinner、也不能跳錯誤橫幅
  await expect(page.getByText('載入', { exact: false })).toBeHidden({ timeout: 10_000 })
  await expect(page.getByText('失敗', { exact: false })).toBeHidden()
})
