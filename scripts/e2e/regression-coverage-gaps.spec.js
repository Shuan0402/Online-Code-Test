// L2 regression：補齊既有 spec 沒覆蓋到的 5 條 AC
// 對應 HackMD：
//   C-1.2 Candidate Story 1 AC 2 — 語言環境隔離（Python / C++ 都走得通）
//   C-2.2 Candidate Story 2 AC 2 — 中途斷線後 worker 仍跑完
//   C-3.2 Candidate Story 3 AC 2 — 「至少一組範例測資」限制（spec 自標未完成）
//   C-3.4 Candidate Story 3 AC 4 — CE/RE 錯誤訊息摘要渲染（spec 自標未完成）
//   I-3.1 Interviewer Story 3 AC 1 — 考試結果頁 % 篩選 + 完考時間排序（spec 自標未完成）
//
// 策略一致：不信 spec 自標、用實測決定每條的真實狀態。fail 訊息本身就是規格 gap 的證據。

import { test, expect } from '@playwright/test'
import { execSync } from 'node:child_process'

const REPO_ROOT_CWD = '../..'
const API_BASE = 'http://localhost:8000'
const SEEDED_CANDIDATE = {
  username: 'e2e_q_candidate@nthu.edu.tw',
  password: 'password123',
}
const QUESTIONER = { username: 'questioner@nthu.edu.tw', password: 'password123' }
const INTERVIEWER = { username: 'interviewer@nthu.edu.tw', password: 'password123' }
const SEEDED_EXAM_TITLE = 'E2E Q 沙箱回歸考試'

async function login(page, user) {
  await page.goto('/login')
  await page.locator('#username').fill(user.username)
  await page.locator('#password').fill(user.password)
  await page.getByRole('button', { name: '登入' }).click()
}

async function loginAndToken(page, user, expectUrl) {
  await login(page, user)
  await page.waitForURL(expectUrl)
  const token = await page.evaluate(() => localStorage.getItem('access_token'))
  expect(token).toBeTruthy()
  return token
}

async function findAssignedProblemId(request, token, problemTitle) {
  const headers = { Authorization: `Bearer ${token}` }
  const examsRes = await request.get(`${API_BASE}/api/v1/exams/`, { headers })
  const seededExam = (await examsRes.json()).find((e) => e.title === SEEDED_EXAM_TITLE)
  expect(seededExam, 'Q seed exam should exist; run regression-questioner first').toBeTruthy()
  const detailRes = await request.get(`${API_BASE}/api/v1/exams/${seededExam.id}`, { headers })
  const detail = await detailRes.json()
  const ep = detail.exam_problems.find((x) => x.title === problemTitle)
  expect(ep, `${problemTitle} should be in seeded exam`).toBeTruthy()
  return { examId: seededExam.id, problemId: ep.problem_id }
}

function runSeed() {
  // C-3.4 會把 exam finalize；下次跑要 reset 回 Ongoing 才能再提交。
  execSync('docker compose exec -T backend python -m app.scripts.seed_e2e_questioner', {
    cwd: REPO_ROOT_CWD,
    stdio: 'inherit',
  })
}

test.beforeAll(() => {
  runSeed()
})

async function pollSubmission(request, token, submissionId, timeoutMs = 60_000) {
  const headers = { Authorization: `Bearer ${token}` }
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500))
    const res = await request.get(`${API_BASE}/api/v1/submissions/${submissionId}`, { headers })
    if (!res.ok()) continue
    last = await res.json()
    if (last.status && !['Pending', 'Judging'].includes(last.status)) return last
  }
  throw new Error(`submission ${submissionId} did not finish (last=${last?.status})`)
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  C-1.2：語言環境隔離                                                   ║
// ╚══════════════════════════════════════════════════════════════════════╝

// C-1.2：candidate 用 C++ 提交、judge worker 應該走 sandbox:cpp、能正常編譯執行
test('C-1.2：C++ 提交走得通（編譯 + 執行 + 拿到非 CE 結果）', async ({ page, request }) => {
  test.setTimeout(90_000)

  const token = await loginAndToken(page, SEEDED_CANDIDATE, '**/candidate/exams')
  const { examId, problemId } = await findAssignedProblemId(request, token, 'E2E-Q-Partial')

  // C++ 版「讀字串、輸出 hello <字串>」對應 Partial 兩筆 testcase (A→hello A, B→hello B)
  const cppSource = `
#include <iostream>
#include <string>
int main() {
    std::string s;
    std::cin >> s;
    std::cout << "hello " << s << std::endl;
    return 0;
}
`

  const createRes = await request.post(`${API_BASE}/api/v1/submissions/`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      problem_id: problemId,
      exam_id: examId,
      language: 'cpp',
      source_code: cppSource,
      submission_type: 'OFFICIAL',
    },
  })
  expect(createRes.ok(), `cpp submission POST should accept (got ${createRes.status()})`).toBeTruthy()
  const sub = await createRes.json()

  const final = await pollSubmission(request, token, sub.id)
  // 雙 testcase 都正確輸出 → AC；只要 worker 真的有走 sandbox:cpp 編譯，就不會卡 CE。
  expect(final.status, `C++ judged status=${final.status}`).toBe('AC')
  expect(final.score).toBe(100)
})

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  C-2.2：中途斷線後 worker 仍跑完                                       ║
// ╚══════════════════════════════════════════════════════════════════════╝

// C-2.2：POST 完馬上 destroy browser context，judge 仍應在後台跑完並寫入 DB
test('C-2.2：POST submission 後立刻關掉 client，judge 仍會完成', async ({ browser, request }) => {
  test.setTimeout(120_000)

  // 1. 開一個臨時 context、登入、提交、紀錄 submission id、token
  const ctx1 = await browser.newContext()
  const page1 = await ctx1.newPage()
  const token = await loginAndToken(page1, SEEDED_CANDIDATE, '**/candidate/exams')
  const { examId, problemId } = await findAssignedProblemId(request, token, 'E2E-Q-Partial')

  const createRes = await request.post(`${API_BASE}/api/v1/submissions/`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      problem_id: problemId,
      exam_id: examId,
      language: 'python',
      source_code: 'print("hello A")\n',
      submission_type: 'OFFICIAL',
    },
  })
  expect(createRes.ok()).toBeTruthy()
  const sub = await createRes.json()
  const submissionId = sub.id

  // 2. 模擬斷線：強制關掉整個 context（cookies / 連線都沒了）
  await ctx1.close()

  // 3. 等 worker 處理（不持有任何 client 連線、跟 page 完全脫鉤）
  await new Promise((r) => setTimeout(r, 8_000))

  // 4. 開新 context 重新登入、查同一筆 submission
  const ctx2 = await browser.newContext()
  const page2 = await ctx2.newPage()
  const token2 = await loginAndToken(page2, SEEDED_CANDIDATE, '**/candidate/exams')

  const final = await pollSubmission(request, token2, submissionId, 60_000)
  expect(
    ['AC', 'WA', 'TLE', 'MLE', 'RE', 'CE'],
    `斷線後 submission ${submissionId} status=${final.status}（應該已判完）`
  ).toContain(final.status)

  await ctx2.close()
})

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  C-3.2：「至少一組範例測資」限制                                       ║
// ╚══════════════════════════════════════════════════════════════════════╝

// C-3.2：API 層 POST 一筆全 is_sample=false 的 problem，backend 應該擋
// （spec 自標未實作 → 預期 fail，fail 訊息證明限制不在）
test('C-3.2：POST 題目時所有 testcase is_sample=false 應該被 backend 擋下', async ({
  page,
  request,
}) => {
  test.setTimeout(30_000)

  const token = await loginAndToken(page, QUESTIONER, '**/questioner**')

  const stamp = Date.now()
  const res = await request.post(`${API_BASE}/api/v1/problems/`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      title: `E2E-Gap-NoSample-${stamp}`,
      description: 'gap test: 全部 testcase is_sample=false',
      difficulty: 'Easy',
      time_limit_ms: 1000,
      memory_limit_mb: 256,
      test_cases: [
        { input_data: '1\n', expected_output: '1\n', score_weight: 50, is_sample: false },
        { input_data: '2\n', expected_output: '2\n', score_weight: 50, is_sample: false },
      ],
    },
  })

  // 若 spec 落實：應該 400/422 帶相關訊息
  // 若 spec 未落實：backend 201 接受 → 規格 gap
  expect(
    res.status(),
    `backend ${res.status()} 接受了全 is_sample=false 的 problem → 「至少一組範例測資」限制未實作`
  ).toBeGreaterThanOrEqual(400)
})

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  C-3.4：CE/RE 錯誤訊息摘要渲染                                         ║
// ╚══════════════════════════════════════════════════════════════════════╝

// C-3.4：python 提交故意執行期錯誤 → ResultPage 應渲染「整體錯誤訊息摘要」+ stderr
test('C-3.4：執行期錯誤的 stderr 摘要應該渲染在考生結果頁', async ({ page, request }) => {
  test.setTimeout(120_000)

  const token = await loginAndToken(page, SEEDED_CANDIDATE, '**/candidate/exams')
  const { examId, problemId } = await findAssignedProblemId(request, token, 'E2E-Q-Partial')

  // 故意執行期錯誤（NameError），worker 預期 → exit_code != 0 → RE
  const brokenPython = 'print(undefined_var_for_re_test)\n'
  const createRes = await request.post(`${API_BASE}/api/v1/submissions/`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      problem_id: problemId,
      exam_id: examId,
      language: 'python',
      source_code: brokenPython,
      submission_type: 'OFFICIAL',
    },
  })
  expect(createRes.ok()).toBeTruthy()
  const sub = await createRes.json()

  // 等 judge 跑完、確認確實是 RE / CE 類錯誤
  const final = await pollSubmission(request, token, sub.id)
  expect(['RE', 'CE'], `應為錯誤類 verdict，實際=${final.status}`).toContain(final.status)

  // 結束考試（如果還沒），這樣 result page 才開得起來
  // 直接走 finalize endpoint，避免 UI 操作干擾
  await request.post(`${API_BASE}/api/v1/exams/${examId}/submit`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  // 載入 ResultPage、展開該題
  await page.goto(`/candidate/exams/${examId}/result`)
  await expect(page.getByText(/考試結果|總得分/).first()).toBeVisible({ timeout: 15_000 })

  // 找出該題目列、點「展開」按鈕（或包含題名的列）
  const row = page.locator('tr', { hasText: 'E2E-Q-Partial' }).first()
  await expect(row).toBeVisible({ timeout: 10_000 })
  // ResultPage 結構假設：列上有「展開」按鈕 / 點列本身會展開
  const expandBtn = row.getByRole('button')
  if (await expandBtn.count()) {
    await expandBtn.first().click()
  } else {
    await row.click()
  }

  // 斷言：頁面上應該渲染「錯誤訊息摘要」字樣 + 非空 stderr 內容
  await expect(
    page.getByText('整體錯誤訊息摘要', { exact: false }),
    'ResultPage 沒渲染錯誤訊息摘要區塊 → 規格 C-3.4 gap'
  ).toBeVisible({ timeout: 10_000 })

  // 摘要區塊內必須有跟 NameError 相關的文字（Python 標準 stderr）
  await expect(page.getByText(/NameError|Traceback|undefined_var_for_re_test/)).toBeVisible({
    timeout: 5_000,
  })
})

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  I-3.1：考試結果頁 % 篩選 + 完考時間排序                               ║
// ╚══════════════════════════════════════════════════════════════════════╝

// I-3.1：interviewer 結果頁應有「分數區間篩選器」UI（spec 自標未完成 → 預期 fail）
test('I-3.1：interviewer 結果頁應提供分數區間 % 篩選器 UI', async ({ page, request }) => {
  test.setTimeout(60_000)

  const token = await loginAndToken(page, INTERVIEWER, '**/interviewer**')

  // 找一張 seeded exam（用 Q seed 的）
  const examsRes = await request.get(`${API_BASE}/api/v1/exams/`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const exams = await examsRes.json()
  const seededExam = exams.find((e) => e.title === SEEDED_EXAM_TITLE)
  expect(seededExam, 'Q seed exam expected').toBeTruthy()

  await page.goto(`/interviewer/exams/${seededExam.id}/result`)
  await page.waitForLoadState('networkidle', { timeout: 15_000 })

  // 期待 UI 上應有可篩選分數區間的元件（input / select / range slider 之一），
  // 或標籤包含「分數」「篩選」「%」「答對率」字樣的 label。
  // 若一個都找不到 → 規格 gap，spec 自標未完成屬實。
  const filterCandidates = await Promise.all([
    page.getByLabel(/分數|%|答對率|篩選/).count(),
    page.getByPlaceholder(/分數|%|答對率/).count(),
    page.getByRole('slider').count(),
  ])
  const total = filterCandidates.reduce((a, b) => a + b, 0)
  expect(
    total,
    `結果頁找不到任何分數篩選 UI（label/placeholder/slider 計 ${total}）→ I-3.1 gap`
  ).toBeGreaterThan(0)
})
