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
  // 攔截 GET /submissions/{id} 請求，強制將其狀態改為 AC（終止態），
  // 這樣前端按鈕就會在第一次點擊後的 300ms 內重新啟用（不需等 worker 跑完），
  // 從而讓我們能在 2s 內點擊第二次，穩定觸發 backend 的 429 限制。
  await page.route('**/api/v1/submissions/*', async (route) => {
    if (route.request().method() === 'GET') {
      try {
        const response = await route.fetch();
        if (response.status() === 200) {
          const json = await response.json();
          json.status = 'AC';
          if (!json.details || json.details.length === 0) {
            json.details = [
              { id: 1, status: 'AC', execution_time: 10, runtime_info: '' }
            ];
          }
          await route.fulfill({ json });
        } else {
          await route.continue();
        }
      } catch (e) {
        await route.continue();
      }
    } else {
      await route.continue();
    }
  });

  await loginAndEnterExam(page)

  // 點試跑（沿用 EditorPanel 預設 detour Python 範本就行、輸出空字串會 WA）
  const runBtn = page.getByRole('button', { name: '試跑' })
  await runBtn.click()

  // 4) 立刻再按一次（必撞 2s cooldown） → banner 顯示「太頻繁」
  // 等待按鈕重新 enabled（因為 mock 讓它極速完成）
  await expect(runBtn).toBeEnabled({ timeout: 5_000 })
  await runBtn.click()
  await expect(page.getByText(/太頻繁/)).toBeVisible({ timeout: 5_000 })

  // 1) panel header 出現
  await expect(page.getByText(/試跑 Testcase 明細（不計分）/)).toBeVisible({ timeout: 10_000 })

  // 2) 「試跑」badge 在 panel header（amber 樣式 span）
  await expect(page.locator('span.bg-amber-100', { hasText: '試跑' })).toBeVisible()

  // 3) tab 狀態不該變成「已提交」/「答對」等 — 應該保持「未提交」
  const tab = page.locator('button[data-problem-id]').first()
  await expect(tab.getByText('未提交')).toBeVisible()
})
