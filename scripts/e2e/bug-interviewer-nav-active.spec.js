// Layer 2 regression — HackMD bug #3
// 症狀：Interviewer 左側 sidebar 永遠把「面試管理」標記為被選取（即使目前在 /candidates 或 /profile）
// 根因：StaffLayout 的「面試管理」NavLink 沒帶 end={true}，導致 /interviewer/* 全都會 match
// 期望：「面試管理」只在剛好停在 /interviewer 時 active；其他頁面 active 應該對應到 URL
import { test, expect } from '@playwright/test'

const USER = { username: 'interviewer@nthu.edu.tw', password: 'password123' }

test('Interviewer 進入「考生管理」時，只有考生管理 active，面試管理不能 active', async ({ page }) => {
  await page.goto('/login')
  await page.locator('#username').fill(USER.username)
  await page.locator('#password').fill(USER.password)
  await page.getByRole('button', { name: '登入' }).click()
  await page.waitForURL('**/interviewer**')

  await page.goto('/interviewer/candidates')
  await expect(page.getByRole('heading', { name: '考生管理' })).toBeVisible({ timeout: 10_000 })

  // NavLink 的 active 狀態會被 react-router 設成 aria-current="page"
  const interviewLink  = page.getByRole('link', { name: '面試管理' })
  const candidatesLink = page.getByRole('link', { name: '考生管理' })

  await expect(candidatesLink).toHaveAttribute('aria-current', 'page')
  await expect(interviewLink).not.toHaveAttribute('aria-current', 'page')
})
