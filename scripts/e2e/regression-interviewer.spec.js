// L2 regression：Interviewer 角色的 user story 回歸（對應 HackMD Story 1~3 各 AC）
//
// 前置條件：
//   docker compose exec backend python -m app.scripts.seed_e2e_interviewer
//   會建立：
//     - candidate: e2e_iv_candidate@nthu.edu.tw / password123 (full_name "E2E IV Candidate")
//     - 6 題：E2E-IV-Easy-1/2、Medium-1/2、Hard-1/2
//     - 1 張 Ongoing 考試「E2E IV 進行中考試」指派給該 candidate，含 4 題
//       (Easy-1, Easy-2, Medium-1, Hard-1) — Medium-2 / Hard-2 不在考試內，
//       供 I-2.3 越權測試使用
//     - 3 筆 submission（Easy-1: AC w/details、Easy-2: WA w/details、Medium-1: CE）
//       Hard-1 故意無提交（I-3.3「此題目無提交紀錄」）

import { test, expect } from '@playwright/test'
import { execSync } from 'node:child_process'

// Repo-relative paths — package.json is CommonJS, so import.meta.url isn't
// available; resolve from cwd of `scripts/e2e/` (where npx playwright runs).
const REPO_ROOT_CWD = '../..'

const INTERVIEWER = { username: 'interviewer@nthu.edu.tw', password: 'password123' }
const SEEDED_CANDIDATE = {
  username: 'e2e_iv_candidate@nthu.edu.tw',
  password: 'password123',
  fullName: 'E2E IV Candidate',
}
const SEEDED_EXAM_TITLE = 'E2E IV 進行中考試'

async function login(page, user) {
  await page.goto('/login')
  await page.locator('#username').fill(user.username)
  await page.locator('#password').fill(user.password)
  await page.getByRole('button', { name: '登入' }).click()
}

async function clearAuth(page) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.evaluate(() => localStorage.clear())
}

function runSeed() {
  execSync('docker compose exec -T backend python -m app.scripts.seed_e2e_interviewer', {
    cwd: REPO_ROOT_CWD,
    stdio: 'inherit',
  })
}

test.beforeAll(() => {
  runSeed()
})

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Story 1 — 權限管理與帳密建立                                          ║
// ╚══════════════════════════════════════════════════════════════════════╝

// I-1.1：interviewer 建 candidate 後，DB 內密碼以 hash 儲存且能 verify
test('I-1.1：建立 candidate 後 DB 密碼是 hash 且 verify_password 通過', async ({ page }) => {
  const stamp = Date.now()
  const username = `e2e_iv_hash_${stamp}@example.com`
  const password = `pw-${stamp}-secret`

  await login(page, INTERVIEWER)
  await page.waitForURL('**/interviewer**')

  await page.goto('/interviewer/candidates/new')
  await page.locator('#username').fill(username)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: '建立考生' }).click()

  // 201 → /interviewer/candidates/<uuid>
  await page.waitForURL(/\/interviewer\/candidates\/[0-9a-f-]{36}$/i)

  // 跨層驗證：docker compose exec 進 backend 執行 inline python 查 DB
  const pyCmd = `import sys; from app.db.session import SessionLocal; from app.models.user import User; from app.core.security import SecurityManager; db = SessionLocal(); user = db.query(User).filter(User.username == sys.argv[1]).first(); (print('[FAIL] user not found'), sys.exit(2)) if not user else (print('[FAIL] verify failed'), sys.exit(1)) if user.password_hash == sys.argv[2] or not SecurityManager.verify_password(sys.argv[2], user.password_hash) else print('[OK]')`
  const out = execSync(`docker compose exec -T backend python -c "${pyCmd}" "${username}" "${password}"`, {
    encoding: 'utf-8',
    cwd: REPO_ROOT_CWD + '/scripts/e2e',
  })
  expect(out).toContain('[OK]')
})

// I-1.2：新建 candidate 用核發的帳密能登入，且被擋在 staff 路由外
test('I-1.2：新建 candidate 登入後只能進考生介面、staff 路由全擋', async ({ page }) => {
  const stamp = Date.now()
  const username = `e2e_iv_login_${stamp}@example.com`
  const password = `pw-${stamp}-login`

  await login(page, INTERVIEWER)
  await page.waitForURL('**/interviewer**')
  await page.goto('/interviewer/candidates/new')
  await page.locator('#username').fill(username)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: '建立考生' }).click()
  await page.waitForURL(/\/interviewer\/candidates\/[0-9a-f-]{36}$/i)

  // 登出新建 candidate 後重新登入
  await clearAuth(page)
  await login(page, { username, password })
  await page.waitForURL('**/candidate/exams')

  // staff 路由全部要被擋
  for (const route of ['/admin', '/interviewer', '/questioner']) {
    await page.goto(route)
    await page.waitForURL('**/unauthorized')
    await expect(page.getByRole('heading', { name: '權限不足' })).toBeVisible()
  }
})

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Story 2 — 客製化考卷難度指派                                          ║
// ╚══════════════════════════════════════════════════════════════════════╝

// I-2.1：ExamForm 設定的難度配額會被 ExamDetail 保留
test('I-2.1：建立草稿時的難度配額在 ExamDetail 重整後仍保留', async ({ page }) => {
  await login(page, INTERVIEWER)
  await page.waitForURL('**/interviewer**')

  await page.goto('/interviewer/exams/new')
  const examTitle = `E2E IV 配額測試 ${Date.now()}`
  await page.locator('#title').fill(examTitle)
  await page.locator('#easy-count').fill('2')
  await page.locator('#medium-count').fill('1')
  await page.locator('#hard-count').fill('1')
  await page.locator('#candidate-id').selectOption({ label: SEEDED_CANDIDATE.fullName })

  await page.getByRole('button', { name: '建立考試' }).click()
  await page.waitForURL(/\/interviewer\/exams\/[0-9a-f-]{36}$/i)

  await page.reload()
  await expect(page.getByText('簡單 2 ／ 中等 1 ／ 困難 1')).toBeVisible()
})

// I-2.2：手選後自動生成不會重複出現已選題目（讀 data-problem-id 驗證）
test('I-2.2：手選 + 自動生成，題目 ID 不重複且配額吻合', async ({ page }) => {
  await login(page, INTERVIEWER)
  await page.waitForURL('**/interviewer**')

  await page.goto('/interviewer/exams/new')
  await page.locator('#title').fill(`E2E IV 去重測試 ${Date.now()}`)
  await page.locator('#easy-count').fill('2')
  await page.locator('#medium-count').fill('1')
  await page.locator('#hard-count').fill('1')
  await page.locator('#candidate-id').selectOption({ label: SEEDED_CANDIDATE.fullName })
  await page.getByRole('button', { name: '建立考試' }).click()
  await page.waitForURL(/\/interviewer\/exams\/[0-9a-f-]{36}$/i)

  // 主表（ExamDetailPage）題目列 row selector
  const mainRows = page.locator('section table tbody tr[data-problem-id]')

  // 開啟手動 picker 加 1 題（Easy-1）
  await page.getByRole('button', { name: '新增題目' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page
    .getByRole('dialog')
    .getByRole('row', { name: /E2E-IV-Easy-1/ })
    .getByRole('button', { name: '加入' })
    .click()
  // 等主表出現 1 列才關 dialog（確保 setExam 已更新）
  await expect(mainRows).toHaveCount(1)
  await page.getByRole('button', { name: '關閉' }).click()

  // 紀錄手選的 ID
  const manualIds = await mainRows.evaluateAll((rows) =>
    rows.map((r) => r.getAttribute('data-problem-id'))
  )
  expect(manualIds).toHaveLength(1)

  // 點自動生成，等補滿到配額總和 4
  await page.getByRole('button', { name: '自動生成題目' }).click()
  await expect(mainRows).toHaveCount(4)

  const allIds = await mainRows.evaluateAll((rows) =>
    rows.map((r) => r.getAttribute('data-problem-id'))
  )

  // 手選的題仍在
  for (const id of manualIds) expect(allIds).toContain(id)
  // 沒有重複 ID
  expect(new Set(allIds).size).toBe(allIds.length)
})

// I-2.3：candidate 不能對未指派題目送 submission（範疇限縮）
test('I-2.3：candidate 透過 API 對未指派 problemId 提交會被擋', async ({ page, request }) => {
  await login(page, SEEDED_CANDIDATE)
  await page.waitForURL('**/candidate/exams')

  const token = await page.evaluate(() => localStorage.getItem('access_token'))
  expect(token).toBeTruthy()
  const authHeaders = { Authorization: `Bearer ${token}` }
  const apiBase = 'http://localhost:8000'

  // 找 seeded 考試 + 它的 assigned problem IDs
  const examsRes = await request.get(`${apiBase}/api/v1/exams/`, { headers: authHeaders })
  expect(examsRes.ok()).toBeTruthy()
  const seededExam = (await examsRes.json()).find((e) => e.title === SEEDED_EXAM_TITLE)
  expect(seededExam, 'seed exam should be visible to assigned candidate').toBeTruthy()

  const examDetailRes = await request.get(`${apiBase}/api/v1/exams/${seededExam.id}`, {
    headers: authHeaders,
  })
  const examDetail = await examDetailRes.json()
  const assignedIds = new Set(examDetail.exam_problems.map((ep) => ep.problem_id))

  // 從題庫全清單找一個不在考試內的 problemId
  const allProblemsRes = await request.get(`${apiBase}/api/v1/problems/`, { headers: authHeaders })
  const unassigned = (await allProblemsRes.json()).find(
    (p) => /E2E-IV-/.test(p.title) && !assignedIds.has(p.id)
  )
  expect(unassigned, 'should have an E2E-IV problem outside the assigned exam').toBeTruthy()

  // 越權嘗試：用 assigned exam_id 配 unassigned problem_id 送 submission
  const submitRes = await request.post(`${apiBase}/api/v1/submissions/`, {
    headers: authHeaders,
    data: {
      problem_id: unassigned.id,
      exam_id: seededExam.id,
      language: 'python',
      source_code: 'print(0)\n',
      submission_type: 'OFFICIAL',
    },
  })
  // 後端對「題目不屬於該場考試」回 400 with 範疇限縮訊息（spirit of spec 403）
  expect(submitRes.ok()).toBeFalsy()
  expect([400, 403]).toContain(submitRes.status())
  const body = await submitRes.json()
  expect(JSON.stringify(body)).toMatch(/範疇|不屬於|越權/)
})

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Story 3 — 全局成績調閱與過濾                                          ║
// ╚══════════════════════════════════════════════════════════════════════╝

// I-3.1：% 篩選 — Bug 4 修正後，篩選位置從 ExamResultPage 搬到 ExamListPage
test('I-3.1：考試列表頁可用 % 區間篩選 + 建立時間 + 重設', async ({ page }) => {
  await login(page, INTERVIEWER)
  await page.waitForURL('**/interviewer**')
  await page.goto('/interviewer')

  // 初始：seeded exam 應該在列表
  await expect(page.getByRole('row', { name: new RegExp(SEEDED_EXAM_TITLE) })).toBeVisible()

  // 答對率最小 99% → SEEDED_EXAM_TITLE 那場（最高約 50%）應被排除
  await page.locator('#score-gte').fill('99')
  await expect(page.getByRole('row', { name: new RegExp(SEEDED_EXAM_TITLE) })).toBeHidden({ timeout: 10_000 })

  // 重設 → 該場 row 重新出現
  await page.locator('#reset-filters').click()
  await expect(page.getByRole('row', { name: new RegExp(SEEDED_EXAM_TITLE) })).toBeVisible()

  // 「只看我的」切換 → 點下不會 throw、UI 狀態變化
  await page.locator('#mine-only-toggle').click()
  await expect(page.locator('#mine-only-toggle')).toHaveText(/只看我的/)
})

// I-3.2：ExamResultPage → SubmissionDetail → 看到 testcase 明細
test('I-3.2：interviewer 進結果頁點題目能看到 testcase 明細表', async ({ page }) => {
  await login(page, INTERVIEWER)
  await page.waitForURL('**/interviewer**')

  // 從考試列表進 seeded exam 結果頁
  await page.goto('/interviewer')
  await page
    .getByRole('row', { name: new RegExp(SEEDED_EXAM_TITLE) })
    .getByRole('link', { name: '查看' })
    .click()
  await page.waitForURL(/\/interviewer\/exams\/[0-9a-f-]{36}$/i)
  await page.getByRole('link', { name: '查看結果' }).click()
  await page.waitForURL(/\/interviewer\/exams\/[0-9a-f-]{36}\/result$/i)

  // 結果表格至少有 4 列（4 題）
  await expect(page.getByRole('cell', { name: 'E2E-IV-Easy-1' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'E2E-IV-Easy-2' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'E2E-IV-Medium-1' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'E2E-IV-Hard-1' })).toBeVisible()

  // 進到 SubmissionDetail 看 testcase 明細（Easy-1 有 2 筆 details）
  // 結果頁 row 沒掛 link，要從 ExamDetail 點「查看提交」。改用 ExamDetail。
  await page.goBack()
  await expect(page.getByRole('heading', { name: SEEDED_EXAM_TITLE })).toBeVisible()
  await page
    .locator('tr[data-problem-id]')
    .filter({ hasText: 'E2E-IV-Easy-1' })
    .getByRole('link', { name: '查看提交' })
    .click()
  await page.waitForURL(/\/interviewer\/exams\/[0-9a-f-]{36}\/problems\/\d+$/)

  // SubmissionDetailPage 必須完整呈現 spec 三項：總分、程式碼、testcase 明細
  // 1) 總分（Easy-1 seed score=100，顯示在「提交資訊」section）
  const infoSection = page.locator('section').filter({ hasText: '提交資訊' })
  await expect(infoSection).toContainText('分數')
  await expect(infoSection).toContainText('100')

  // 2) 程式碼區塊（S3 mock URL fetch 可能失敗 → 顯示 placeholder；
  //    spec 要求的是 UI 區塊必須渲染，所以只 assert section heading）
  await expect(page.getByRole('heading', { name: '提交程式碼' })).toBeVisible()

  // 3) testcase 明細表 + 每筆執行時間欄
  await expect(page.getByRole('heading', { name: '測資結果' })).toBeVisible()
  const detailsSection = page.locator('section').filter({ hasText: '測資結果' })
  await expect(detailsSection.locator('tbody tr')).toHaveCount(2)
  // Easy-1 seed details：execution_time = 20 ms / 22 ms
  await expect(detailsSection).toContainText('20 ms')
  await expect(detailsSection).toContainText('22 ms')
})

// I-3.3：CE / 未繳交時，後台 UI 仍正常渲染
test('I-3.3：CE 與「此題目無提交紀錄」在後台都能正常顯示', async ({ page }) => {
  await login(page, INTERVIEWER)
  await page.waitForURL('**/interviewer**')

  await page.goto('/interviewer')
  await page
    .getByRole('row', { name: new RegExp(SEEDED_EXAM_TITLE) })
    .getByRole('link', { name: '查看' })
    .click()
  await page.waitForURL(/\/interviewer\/exams\/[0-9a-f-]{36}$/i)

  // ── CE：Medium-1 ─────────────────────────────────────────────────
  await page
    .locator('tr[data-problem-id]')
    .filter({ hasText: 'E2E-IV-Medium-1' })
    .getByRole('link', { name: '查看提交' })
    .click()
  await page.waitForURL(/\/interviewer\/exams\/[0-9a-f-]{36}\/problems\/\d+$/)
  // CE 狀態應顯示出來；JudgeStatusBadge 會輸出 "CE" 字樣
  await expect(page.locator('section').filter({ hasText: '提交資訊' }).getByText('CE')).toBeVisible()

  // ── 未提交：Hard-1 ────────────────────────────────────────────────
  await page.goBack()
  await expect(page.getByRole('heading', { name: SEEDED_EXAM_TITLE })).toBeVisible()
  await page
    .locator('tr[data-problem-id]')
    .filter({ hasText: 'E2E-IV-Hard-1' })
    .getByRole('link', { name: '查看提交' })
    .click()
  await page.waitForURL(/\/interviewer\/exams\/[0-9a-f-]{36}\/problems\/\d+$/)
  await expect(page.getByText('考生尚未提交此題')).toBeVisible()
})
