// L2 regression：Candidate 角色「需要種子資料」的反例 + 細節覆蓋
//
// 對應 user story：B1, C3, D1, B3反/D5, C1反, D4
//
// 前置條件：
//   docker compose exec backend python -m app.scripts.seed_e2e_candidate
//   會建立三張考試：
//     - 「Demo Exam (happy path)」 Ongoing  → C3, D1
//     - 「E2E 已結束考試」         Finished → B3反 / D5
//     - 「E2E 別人的考試」         Ongoing  → C1反（給 candidate@nthu.edu.tw）
//     - 「E2E 倒數歸零」           Ongoing  → D4（remaining ≈ 8 秒）
//
// D4 那條 test 進場後 remaining 會被用掉、status 變 Finished，所以該 test
// 用 beforeEach 重跑 seed 重置。

import { test, expect } from '@playwright/test'
import { execSync } from 'node:child_process'

const CANDIDATE = { username: 'demo_candidate', password: 'password123' }

// ── 登入小工具 ─────────────────────────────────────────────────────────────
async function loginAsCandidate(page) {
  await page.goto('/login')
  await page.locator('#username').fill(CANDIDATE.username)
  await page.locator('#password').fill(CANDIDATE.password)
  await page.getByRole('button', { name: '登入' }).click()
  await page.waitForURL('**/candidate/exams')
}

function runSeed() {
  execSync('docker compose exec -T backend python -m app.scripts.seed_e2e_candidate', {
    cwd: '../..',
    stdio: 'inherit',
  })
}

// 整支 spec 跑前先 reset 全部 seed。確保 status / start_time 都是新的，
// 才不會被前一次 run 用掉的考試狀態影響。
test.beforeAll(() => {
  runSeed()
})

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  B1：考生只看到自己被指派的考試                                            ║
// ╚══════════════════════════════════════════════════════════════════════════╝
test('B1：考生考試列表只看到自己的，看不到別人的', async ({ page }) => {
  await loginAsCandidate(page)
  await expect(page.getByRole('heading', { name: '我的考試' })).toBeVisible()

  await expect(page.getByText('Demo Exam (happy path)')).toBeVisible()
  await expect(page.getByText('E2E 已結束考試')).toBeVisible()
  // 「E2E 別人的考試」是分給 candidate@nthu.edu.tw 的 → demo_candidate 不該看到
  await expect(page.getByText('E2E 別人的考試')).toHaveCount(0)
})

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  B2 / E3：考試列表 status badge 正確顯示「進行中 / 已結束」                 ║
// ╚══════════════════════════════════════════════════════════════════════════╝
test('B2/E3：列表上 Ongoing 顯示「進行中」、Finished 顯示「已結束」', async ({ page }) => {
  await loginAsCandidate(page)

  const ongoingCard = page
    .locator('div.border.rounded-lg')
    .filter({ hasText: 'E2E 進行中考試' })
  // exact: true 避免被標題「E2E 進行中考試」吃掉而 strict-mode 報錯
  await expect(ongoingCard.getByText('進行中', { exact: true })).toBeVisible()

  const finishedCard = page
    .locator('div.border.rounded-lg')
    .filter({ hasText: 'E2E 已結束考試' })
  await expect(finishedCard.getByText('已結束', { exact: true })).toBeVisible()
})

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  C2：take 頁顯示題目格式欄位（時間/記憶體限制、範例測資）                  ║
// ╚══════════════════════════════════════════════════════════════════════════╝
test('C2：take 頁渲染「時間限制」「記憶體限制」「範例測資」', async ({ page }) => {
  await loginAsCandidate(page)
  const card = page
    .locator('div.border.rounded-lg')
    .filter({ hasText: 'E2E 進行中考試' })
  await card.getByRole('button', { name: '開始作答' }).click()
  await page.getByRole('button', { name: '確認開始' }).click()
  await page.waitForURL('**/candidate/exams/*/take')

  await expect(page.getByText('時間限制：', { exact: false })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('記憶體限制：', { exact: false })).toBeVisible()
  // 範例測資只在後端有 sample testcase 時出現；problem 1 至少 1 筆 sample
  await expect(page.getByText('範例測資')).toBeVisible()
})

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  C3：Monaco 編輯器可以在 Python 跟 C++ 之間切換                            ║
// ╚══════════════════════════════════════════════════════════════════════════╝
test('C3：切換語言會改變 Monaco model 的 language id', async ({ page }) => {
  await loginAsCandidate(page)

  // 進「Demo Exam (happy path)」
  const card = page
    .locator('div.border.rounded-lg')
    .filter({ hasText: 'E2E 進行中考試' })
  await card.getByRole('button', { name: '開始作答' }).click()
  await page.getByRole('button', { name: '確認開始' }).click()
  await page.waitForURL('**/candidate/exams/*/take')

  // 等 Monaco 載完
  await page.waitForFunction(
    () => window.monaco?.editor?.getEditors().length > 0,
    null,
    { timeout: 20_000 }
  )

  // 預設 python
  await expect(page.locator('#lang-select')).toHaveValue('python')
  const pyLang = await page.evaluate(() =>
    window.monaco.editor.getEditors()[0].getModel().getLanguageId()
  )
  expect(pyLang).toBe('python')

  // 切到 C++
  await page.locator('#lang-select').selectOption('cpp')
  await expect(page.locator('#lang-select')).toHaveValue('cpp')
  const cppLang = await page.evaluate(() =>
    window.monaco.editor.getEditors()[0].getModel().getLanguageId()
  )
  expect(cppLang).toBe('cpp')
})

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  D1：提交後立刻看到「評判中」badge + 提交按鈕 disable                       ║
// ╚══════════════════════════════════════════════════════════════════════════╝
test('D1：提交後前端立刻給「評判中」回應', async ({ page }) => {
  await loginAsCandidate(page)
  const card = page
    .locator('div.border.rounded-lg')
    .filter({ hasText: 'E2E 進行中考試' })
  await card.getByRole('button', { name: '開始作答' }).click()
  await page.getByRole('button', { name: '確認開始' }).click()
  await page.waitForURL('**/candidate/exams/*/take')

  await page.waitForFunction(
    () => window.monaco?.editor?.getEditors().length > 0,
    null,
    { timeout: 20_000 }
  )

  // 隨便塞個會被收走的程式碼（不需正確，只要走完提交流程）
  await page.evaluate(() => {
    window.monaco.editor.getEditors()[0].setValue('print(1)\n')
  })

  await page.getByRole('button', { name: /提交本題/ }).click()

  // 立刻 assert：tab 上有「評判中」字樣（本地 backend 太快，按鈕 disable 視窗不到 200ms 抓不到）
  const pendingBadge = page.locator('button:has-text("題 1") >> text=評判中').first()
  await expect(pendingBadge).toBeVisible({ timeout: 5_000 })
})

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  B3反 / D5：已結束的考試不能進場                                           ║
// ╚══════════════════════════════════════════════════════════════════════════╝
test('B3反/D5：已結束考試在列表頁無「開始作答」鈕', async ({ page }) => {
  await loginAsCandidate(page)

  // 找到「E2E 已結束考試」那張卡片
  const card = page.locator('div.border.rounded-lg').filter({ hasText: 'E2E 已結束考試' })
  await expect(card).toBeVisible()

  // 該卡片底下不該有「開始作答」按鈕
  await expect(
    card.getByRole('button', { name: '開始作答' })
  ).toHaveCount(0)
})

test('D5：直接打 /take URL 進入已結束的考試會被導去結果頁', async ({ page }) => {
  await loginAsCandidate(page)

  // 從列表先抓到「E2E 已結束考試」的 exam id
  const examId = await page.evaluate(async () => {
    const token = localStorage.getItem('access_token')
    const res = await fetch('/api/v1/exams/', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const list = await res.json()
    return list.find((e) => e.title === 'E2E 已結束考試')?.id
  })
  expect(examId).toBeTruthy()

  await page.goto(`/candidate/exams/${examId}/take`)
  // 後端 /start 回 400 → TakeExamPage 自動 navigate 去 /result
  await page.waitForURL(`**/candidate/exams/${examId}/result`, { timeout: 10_000 })
})

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  C1反：改 URL 偷看別人的考試 → 看到「無權」錯誤                              ║
// ╚══════════════════════════════════════════════════════════════════════════╝
test('C1反：用別人的 examId 打 /take URL 會被擋', async ({ page }) => {
  await loginAsCandidate(page)

  // demo_candidate 自己的列表看不到「E2E 別人的考試」，所以這裡用 admin token 拿 id
  const otherExamId = await page.evaluate(async () => {
    // 用 candidate 本人 token 打不會看到別人的，所以我們改抓全部然後排除
    // —— 但 candidate 沒有 list-all 權限。為了避免依賴 admin login，直接用 evaluate
    //    呼叫 fetch 探測：嘗試 GET /exams/ 後看排除自己的剩下啥。
    //    若 backend 嚴格只回自己的（B1 已驗證），這裡會拿不到 id。
    //
    //  → 改成從 window 拿 hard-coded 不存在的 uuid 也測得到「擋住」這件事；
    //     但這樣測的是 404，不是 403。最乾淨做法是另開 admin login 撈 id。
    return null
  })
  // 簡化：直接登 admin 拿 id（fetch 不會帶現有 candidate token）
  const adminToken = await page.evaluate(async () => {
    const body = new URLSearchParams()
    body.set('username', 'admin@nthu.edu.tw')
    body.set('password', 'password123')
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    return (await res.json()).access_token
  })
  const realOtherExamId = await page.evaluate(async (token) => {
    const res = await fetch('/api/v1/exams/', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const list = await res.json()
    return list.find((e) => e.title === 'E2E 別人的考試')?.id
  }, adminToken)
  expect(realOtherExamId).toBeTruthy()

  await page.goto(`/candidate/exams/${realOtherExamId}/take`)
  // 後端 /start 回 403 → 前端 catch 進 loadError 分支 → 顯示錯誤訊息
  await expect(page.getByText('您無權參與此場考試')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: '返回考試列表' })).toBeVisible()
})

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  E2：結果頁可展開每題的 testcase 明細表格                                  ║
// ╚══════════════════════════════════════════════════════════════════════════╝
test('E2：結果頁點「展開」會顯示 testcase 明細表（含 status / 耗時 / runtime_info）', async ({ page }) => {
  await loginAsCandidate(page)

  // 抓「E2E 已結束考試」id（seed 已造 + 合成 submission with 2 details）
  const examId = await page.evaluate(async () => {
    const token = localStorage.getItem('access_token')
    const res = await fetch('/api/v1/exams/', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const list = await res.json()
    return list.find((e) => e.title === 'E2E 已結束考試')?.id
  })
  expect(examId).toBeTruthy()

  await page.goto(`/candidate/exams/${examId}/result`)

  // 等待主表載入
  await expect(page.getByRole('heading', { name: '考試結果' })).toBeVisible()
  await expect(page.getByText('兩數相加 (demo)')).toBeVisible()

  // 點「展開 ▼」
  const row = page.getByRole('row', { name: '兩數相加 (demo)' })
  const expandBtn = row.getByRole('button', { name: '展開明細' })
  await expandBtn.click()

  // testcase 表格出現（合成 submission 有 AC + WA 兩筆）
  await expect(page.getByText('Testcase', { exact: false })).toBeVisible({ timeout: 5_000 })
  await expect(page.getByText('Expected: 7')).toBeVisible()
  await expect(page.getByText('Got: 6')).toBeVisible()
  await expect(page.getByText('23 ms')).toBeVisible()
  await expect(page.getByText('18 ms')).toBeVisible()

  // 收合
  await row.getByRole('button', { name: '收合明細' }).click()
  await expect(page.getByText('Expected: 7')).not.toBeVisible()
})

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  D4：作答中倒數歸零 → 自動跳「考試時間到」對話框                            ║
// ╚══════════════════════════════════════════════════════════════════════════╝
test.describe('D4 倒數歸零', () => {
  test.beforeEach(() => {
    // 每次重設「E2E 倒數歸零」start_time，讓 remaining ≈ 8 秒
    runSeed()
  })

  test('D4：作答中倒數歸零會自動觸發「考試時間到」對話框', async ({ page }) => {
    await loginAsCandidate(page)

    const card = page.locator('div.border.rounded-lg').filter({ hasText: 'E2E 倒數歸零' })
    await card.getByRole('button', { name: '開始作答' }).click()
    await page.getByRole('button', { name: '確認開始' }).click()
    await page.waitForURL('**/candidate/exams/*/take')

    // remaining ≈ 8 秒，留 20 秒給倒數歸零
    await expect(page.getByText('考試時間到')).toBeVisible({ timeout: 20_000 })
  })
})
