// Bug 5 Layer 2 — 語言切換時每個語言各自獨立 draft
// 症狀：切到 C++ 時 Python 註解/草稿還在；切回 Python 又被 C++ 樣板覆蓋
// 期望：每語言一份 draft，切換時保留各自內容
//
// 注意：Monaco editor 在 jsdom 不能跑、但 Playwright 真實 Chromium 可。
// 用 textbox role 抓 Monaco textarea（Monaco 暴露 role="textbox"）。
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

  // 等 Monaco 起來
  await expect(page.getByRole('combobox')).toBeVisible({ timeout: 10_000 })
}

test('Bug 5：切到 C++ 載入 C++ 樣板、Python 註解不殘留', async ({ page }) => {
  await loginAndEnterExam(page)

  // 預設 Python，Monaco 內容應含 Python 註解
  await expect(page.getByText('請在此輸入您的 Python 程式碼')).toBeVisible()

  // 切到 C++ 下拉
  const langSelect = page.locator('#lang-select')
  await langSelect.selectOption('cpp')

  // 應載入 C++ 樣板（#include + main 函式 + C++ 註解）
  await expect(page.getByText('請在此輸入您的 C++ 程式碼')).toBeVisible({ timeout: 5_000 })
  await expect(page.getByText('#include')).toBeVisible()

  // Python 預設註解不應該還在
  await expect(page.getByText('請在此輸入您的 Python 程式碼')).toBeHidden()
})

test('Bug 5：切回 Python 時還原原本 Python 註解（draft 各自獨立）', async ({ page }) => {
  await loginAndEnterExam(page)

  // 切 cpp → 確認 cpp 樣板
  await page.locator('#lang-select').selectOption('cpp')
  await expect(page.getByText('#include')).toBeVisible({ timeout: 5_000 })

  // 切回 python → Python 註解該還在（DEFAULT_CODE.python，沒手動 edit 過所以是預設）
  await page.locator('#lang-select').selectOption('python')
  await expect(page.getByText('請在此輸入您的 Python 程式碼')).toBeVisible({ timeout: 5_000 })
  await expect(page.getByText('#include')).toBeHidden()
})
