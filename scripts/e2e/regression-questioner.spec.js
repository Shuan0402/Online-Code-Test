// L2 regression：Questioner 角色的 user story 回歸
// （對應 HackMD Questioner Story 1「結構化題目與效能邊界」與 Advanced Story
//  「資源限制與沙箱安全防禦」的各 AC）
//
// 前置條件：
//   docker compose exec backend python -m app.scripts.seed_e2e_questioner
//   會建立：
//     - candidate: e2e_q_candidate@nthu.edu.tw / password123
//     - 4 題：E2E-Q-TLE / E2E-Q-Partial / E2E-Q-MemBomb / E2E-Q-Network
//     - 1 張 Ongoing 考試「E2E Q 沙箱回歸考試」含上述 4 題
//
// Q-1.1 走 UI（questioner 建題）+ 跨層 helper 驗 DB；
// Q-1.2 / Q-1.3 / Q-2.1 / Q-2.2 走 API：candidate 提交、輪詢判題結果，
// 驗證 worker 與沙箱行為。
// Q-2.3（前端切分頁/clipboard 監控）spec 自標未完成 → test.fixme。

import { test, expect } from '@playwright/test'
import { execSync } from 'node:child_process'

// Repo-relative paths — package.json is CommonJS, so import.meta.url isn't
// available; resolve from cwd of `scripts/e2e/` (where npx playwright runs).
const HELPER = './helpers/verify-problem-testcases.sh'
const REPO_ROOT_CWD = '../..'

const QUESTIONER = { username: 'questioner@nthu.edu.tw', password: 'password123' }
const SEEDED_CANDIDATE = {
  username: 'e2e_q_candidate@nthu.edu.tw',
  password: 'password123',
}
const SEEDED_EXAM_TITLE = 'E2E Q 沙箱回歸考試'
const API_BASE = 'http://localhost:8000'

async function login(page, user) {
  await page.goto('/login')
  await page.locator('#username').fill(user.username)
  await page.locator('#password').fill(user.password)
  await page.getByRole('button', { name: '登入' }).click()
}

function runSeed() {
  execSync('docker compose exec -T backend python -m app.scripts.seed_e2e_questioner', {
    cwd: REPO_ROOT_CWD,
    stdio: 'inherit',
  })
}

// Look up an assigned problem ID for the seeded candidate by problem title.
async function findAssignedProblemId(request, token, problemTitle) {
  const headers = { Authorization: `Bearer ${token}` }
  const examsRes = await request.get(`${API_BASE}/api/v1/exams/`, { headers })
  const seededExam = (await examsRes.json()).find((e) => e.title === SEEDED_EXAM_TITLE)
  expect(seededExam, 'seed exam should be visible to assigned candidate').toBeTruthy()

  const detailRes = await request.get(`${API_BASE}/api/v1/exams/${seededExam.id}`, { headers })
  const detail = await detailRes.json()
  const ep = detail.exam_problems.find((x) => x.title === problemTitle)
  expect(ep, `assigned problem "${problemTitle}" should be in seeded exam`).toBeTruthy()
  return { problemId: ep.problem_id, examId: seededExam.id }
}

// Submit + poll until the judge worker finishes (status leaves Pending/Judging).
// Returns the final submission record.
async function submitAndAwait(request, token, { examId, problemId, sourceCode, language = 'python' }) {
  const headers = { Authorization: `Bearer ${token}` }
  const createRes = await request.post(`${API_BASE}/api/v1/submissions/`, {
    headers,
    data: {
      problem_id: problemId,
      exam_id: examId,
      language,
      source_code: sourceCode,
      submission_type: 'OFFICIAL',
    },
  })
  expect(createRes.ok(), `submission POST should accept (got ${createRes.status()})`).toBeTruthy()
  const submission = await createRes.json()

  // Poll for up to 60s (judge worker + sandbox cold start ~5–30s).
  const deadline = Date.now() + 60_000
  let last = submission
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500))
    const pollRes = await request.get(`${API_BASE}/api/v1/submissions/${submission.id}`, { headers })
    if (!pollRes.ok()) continue
    last = await pollRes.json()
    if (last.status && !['Pending', 'Judging'].includes(last.status)) {
      return last
    }
  }
  throw new Error(`submission ${submission.id} did not finish judging within 60s (last status=${last.status})`)
}

test.beforeAll(() => {
  runSeed()
})

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Story 1 — 結構化題目與效能邊界設定                                    ║
// ╚══════════════════════════════════════════════════════════════════════╝

// Q-1.1：UI 建題 + 多測資 → DB 一對多寫入（含 time/memory limit）
test('Q-1.1：questioner 透過 UI 建題後 DB 有 problem + 一對多 testcase', async ({ page }) => {
  const stamp = Date.now()
  const title = `E2E-Q-StructWrite-${stamp}`
  const timeLimit = 1500
  const memoryLimit = 128

  await login(page, QUESTIONER)
  await page.waitForURL('**/questioner**')

  await page.goto('/questioner/problems/new')
  await page.locator('#title').fill(title)
  await page.locator('#description').fill(`E2E 結構化寫入驗證 ${stamp}`)
  await page.locator('#difficulty').selectOption('Medium')
  await page.locator('#time-limit').fill(String(timeLimit))
  await page.locator('#memory-limit').fill(String(memoryLimit))

  // 加 3 筆測資
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: '新增一筆測資' }).click()
    await page.locator(`#input-${i}`).fill(`${i}\n`)
    await page.locator(`#output-${i}`).fill(`${i}\n`)
    await page.locator(`#score-${i}`).fill('30')
  }
  // 至少一筆要勾範例測資（前端驗證強制）
  await page.locator('#sample-0').check()

  await page.getByRole('button', { name: '新增題目' }).click()

  // 成功後跳回題目列表
  await page.waitForURL('**/questioner/problems')

  // 跨層驗證：docker exec 進 backend 查 DB
  const out = execSync(
    `${HELPER} "${title}" 3 ${timeLimit} ${memoryLimit}`,
    { encoding: 'utf-8', cwd: REPO_ROOT_CWD + '/scripts/e2e' }
  )
  expect(out).toContain('[OK]')
})

// Q-1.2：對 time_limit=500ms 題目送無窮迴圈 → judge worker 應回 TLE
test('Q-1.2：candidate 提交無窮迴圈、judge worker 應在 time_limit 內判 TLE', async ({ page, request }) => {
  test.setTimeout(90_000)

  await login(page, SEEDED_CANDIDATE)
  await page.waitForURL('**/candidate/exams')
  const token = await page.evaluate(() => localStorage.getItem('access_token'))
  expect(token).toBeTruthy()

  const { examId, problemId } = await findAssignedProblemId(request, token, 'E2E-Q-TLE')
  const final = await submitAndAwait(request, token, {
    examId,
    problemId,
    sourceCode: 'while True:\n    pass\n',
  })

  expect(final.status).toBe('TLE')
})

// Q-1.3：兩筆 testcase（50/50），程式只通過 1 筆 → score=50（partial credit）
test('Q-1.3：提交僅通過 1/2 testcase 時 score 為通過權重總和（partial credit）', async ({ page, request }) => {
  test.setTimeout(90_000)

  await login(page, SEEDED_CANDIDATE)
  await page.waitForURL('**/candidate/exams')
  const token = await page.evaluate(() => localStorage.getItem('access_token'))
  expect(token).toBeTruthy()

  const { examId, problemId } = await findAssignedProblemId(request, token, 'E2E-Q-Partial')
  // 不讀 input，固定輸出 "hello A"：tc1 expected "hello A\n" → AC；tc2 expected "hello B\n" → WA。
  const final = await submitAndAwait(request, token, {
    examId,
    problemId,
    sourceCode: 'print("hello A")\n',
  })

  // 整體狀態不是 AC（因為有測資沒過）。
  // partial credit 算法：round(AC_weight_sum / total_weight * exam_problem.points)
  //   = round(50 / 100 * 25) = 12（Python banker's rounding）
  // exam_problem.points 來自 seed_e2e_questioner._upsert_exam：100 // 4 = 25。
  expect(final.status).not.toBe('AC')
  expect(final.score).toBe(12)
})

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Advanced Story — 資源限制與沙箱安全防禦                               ║
// ╚══════════════════════════════════════════════════════════════════════╝

// Q-2.1：memory_limit_mb=128 的題目分配 256MB → cgroup 應 OOM-kill
test('Q-2.1：超過 cgroup 記憶體上限的提交應被沙箱擋下（非 AC）', async ({ page, request }) => {
  test.setTimeout(90_000)

  await login(page, SEEDED_CANDIDATE)
  await page.waitForURL('**/candidate/exams')
  const token = await page.evaluate(() => localStorage.getItem('access_token'))
  expect(token).toBeTruthy()

  const { examId, problemId } = await findAssignedProblemId(request, token, 'E2E-Q-MemBomb')
  // 256MB 的 bytes 物件，遠超 problem.memory_limit_mb=128 → cgroup OOM-kill
  const final = await submitAndAwait(request, token, {
    examId,
    problemId,
    sourceCode: 'x = bytearray(256 * 1024 * 1024)\nprint("ok")\n',
  })

  // 被 OOM-kill 後 judge worker 可能回 MLE 或 RE，視 spawner 對 exit code 的解讀；
  // 兩者都代表沙箱有擋下記憶體濫用 — 不可能是 AC。
  expect(['MLE', 'RE']).toContain(final.status)
})

// Q-2.1 (CPU)：cgroup CPU quota 應該已套到 sandbox
// 手法：python 讀 /sys/fs/cgroup/cpu.max (cgroup v2) 或 cpu.cfs_quota_us/period_us (v1)
// 寫到 stderr，judge_log 撈出後斷言值不是「unbounded」
test('Q-2.1 (CPU)：sandbox cgroup CPU quota 已套用（讀 /sys/fs/cgroup 驗）', async ({ page, request }) => {
  test.setTimeout(90_000)

  await login(page, SEEDED_CANDIDATE)
  await page.waitForURL('**/candidate/exams')
  const token = await page.evaluate(() => localStorage.getItem('access_token'))
  expect(token).toBeTruthy()

  const { examId, problemId } = await findAssignedProblemId(request, token, 'E2E-Q-Partial')

  // 讀 cgroup 寫 stderr。stdout 給對 testcase 1（"A" → "hello A"）讓 judge 跑得完。
  const introspector = [
    'import sys',
    'try:',
    '    info = open("/sys/fs/cgroup/cpu.max").read().strip()',
    '    sys.stderr.write(f"CGROUP_CPU={info}\\n")',
    'except FileNotFoundError:',
    '    try:',
    '        q = open("/sys/fs/cgroup/cpu/cpu.cfs_quota_us").read().strip()',
    '        p = open("/sys/fs/cgroup/cpu/cpu.cfs_period_us").read().strip()',
    '        sys.stderr.write(f"CGROUP_CPU=v1:quota={q}_period={p}\\n")',
    '    except Exception as e:',
    '        sys.stderr.write(f"CGROUP_CPU=err:{e}\\n")',
    'print("hello A")',
    '',
  ].join('\n')

  const final = await submitAndAwait(request, token, {
    examId,
    problemId,
    sourceCode: introspector,
  })

  // judge_log 應含 CGROUP_CPU=...，值不是 "max ..."（v2 無上限）也不是 v1 的 quota=-1
  const m = final.judge_log?.match(/CGROUP_CPU=(.+)/)
  expect(m, `judge_log 找不到 CGROUP_CPU 行；log=${final.judge_log}`).toBeTruthy()
  const value = m[1].trim()
  expect(value, `cgroup v2 cpu.max 顯示無上限 "${value}"`).not.toMatch(/^max\s/)
  expect(value, `cgroup v1 quota=-1 顯示無上限 "${value}"`).not.toMatch(/^v1:quota=-1/)
})

// Q-2.2：沙箱 network 應被阻斷 → 嘗試外連必失敗（非 AC）
test('Q-2.2：沙箱內網路連線應被阻斷（外連不會成功）', async ({ page, request }) => {
  test.setTimeout(90_000)

  await login(page, SEEDED_CANDIDATE)
  await page.waitForURL('**/candidate/exams')
  const token = await page.evaluate(() => localStorage.getItem('access_token'))
  expect(token).toBeTruthy()

  const { examId, problemId } = await findAssignedProblemId(request, token, 'E2E-Q-Network')
  const source = [
    'import socket',
    'try:',
    '    socket.create_connection(("1.1.1.1", 80), timeout=2)',
    '    print("ok")',
    'except OSError as e:',
    '    print(f"blocked: {e}")',
    '',
  ].join('\n')
  const final = await submitAndAwait(request, token, {
    examId,
    problemId,
    sourceCode: source,
  })

  // 預期輸出 "ok\n"。若網路真被阻斷 → 印 "blocked: ..." → WA；
  // 若 socket 連線觸發 spawner exception → RE。兩者皆代表沙箱有擋下外連，AC 才算 spec 漏洞。
  expect(final.status).not.toBe('AC')
})

// Q-2.3：切分頁 (visibilitychange) + 大量貼上 (paste > 100 字) → 顯示警示橫幅
test('Q-2.3：切換視窗 / 大量貼上會被前端攔截並顯示警示橫幅', async ({ page }) => {
  test.setTimeout(60_000)

  await login(page, SEEDED_CANDIDATE)
  await page.waitForURL('**/candidate/exams')

  // 進考試：點任一「開始作答」按鈕（已 Ongoing 的 seed exam）
  const startButton = page.getByRole('button', { name: '開始作答' }).first()
  await expect(startButton).toBeVisible({ timeout: 10_000 })
  await startButton.click()
  await page.getByRole('button', { name: '確認開始' }).click()
  await page.waitForURL('**/candidate/exams/*/take')

  // 等 Monaco 載完，確保 TakeExamPage 已 mount listener
  await page.waitForFunction(
    () => window.monaco && window.monaco.editor && window.monaco.editor.getEditors().length > 0,
    null,
    { timeout: 20_000 }
  )

  const alert = page.getByTestId('behavior-alert')
  // 初始：警示橫幅不應該顯示
  await expect(alert).toBeHidden()

  // ── 1. 模擬切換視窗（visibilitychange → hidden）─────────────────────
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(alert).toBeVisible()
  await expect(alert).toContainText('1 次切換視窗')
  await expect(alert).toContainText('0 次大量貼上')

  // ── 2. 模擬大量貼上（> 100 字）─────────────────────────────────────
  await page.evaluate(() => {
    const data = new DataTransfer()
    data.setData('text/plain', 'x'.repeat(200))
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  })
  await expect(alert).toContainText('1 次大量貼上')
})
