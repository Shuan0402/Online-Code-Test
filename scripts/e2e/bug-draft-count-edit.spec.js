// Bug 7 Layer 2 — 草稿狀態下可修改題數配比
// 症狀：ExamDetailPage 沒提供 easy/medium/hard count input，使用者改不了
// 期望：Draft 狀態下能改、PATCH /exams/{id} 回 200、頁面顯示新值
//
// 流程：interviewer 建立 Draft 考試 → 進詳情頁 → 改 easy_count → 儲存 → 重整 → 還是新值
import { test, expect } from '@playwright/test'

const INTERVIEWER = { username: 'demo_questioner', password: 'password123' }
// 註：seed 把 demo_questioner 設為 Questioner role；
// 但建立考試需要 Interviewer / Admin，這裡改用 admin 帳號

const ADMIN = { username: 'admin@nthu.edu.tw', password: 'password123' }

async function login(page, user) {
  await page.goto('/login')
  await page.locator('#username').fill(user.username)
  await page.locator('#password').fill(user.password)
  await page.getByRole('button', { name: '登入' }).click()
}

test('Bug 7：Draft 考試可修改 easy/medium/hard 題數並儲存成功', async ({ page }) => {
  await login(page, ADMIN)
  await page.waitForURL(/\/(admin|interviewer)/)

  // 透過 API 建一場 Draft 考試（避免依賴 UI 流程的副作用）
  const examId = await page.evaluate(async () => {
    const token = localStorage.getItem('access_token')
    // 拿一個 candidate id
    const usersRes = await fetch('/api/v1/users/', { headers: { Authorization: `Bearer ${token}` } })
    const users = await usersRes.json()
    const candidate = users.find((u) => u.role === 'Candidate')

    const res = await fetch('/api/v1/exams/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Bug 7 e2e count edit',
        duration_minutes: 60,
        easy_count: 0,
        medium_count: 0,
        hard_count: 0,
        candidate_id: candidate.id,
      }),
    })
    const data = await res.json()
    return data.id
  })
  expect(examId).toBeTruthy()

  // 進詳情頁
  await page.goto(`/interviewer/exams/${examId}`)
  await expect(page.getByText('Bug 7 e2e count edit')).toBeVisible({ timeout: 10_000 })

  // 三個 input 應該存在且可改（草稿狀態）
  const easyInput = page.locator('#edit-easy')
  const mediumInput = page.locator('#edit-medium')
  const hardInput = page.locator('#edit-hard')
  await expect(easyInput).toBeEnabled()
  await expect(mediumInput).toBeEnabled()
  await expect(hardInput).toBeEnabled()

  await easyInput.fill('3')
  await mediumInput.fill('2')
  await hardInput.fill('1')

  // 點儲存設定
  await page.getByRole('button', { name: /儲存設定/ }).click()

  // 重新整理頁面 → 三個 input 還是新值（PATCH 寫進 DB）
  await page.reload()
  await expect(page.locator('#edit-easy')).toHaveValue('3')
  await expect(page.locator('#edit-medium')).toHaveValue('2')
  await expect(page.locator('#edit-hard')).toHaveValue('1')
})
