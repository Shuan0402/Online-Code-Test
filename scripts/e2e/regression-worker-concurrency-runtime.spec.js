// Worker 併發上限 — runtime 回歸（OJ 系統工程師 Story 1 AC2）
//
// 搭配 regression-worker-concurrency.spec.js（靜態 config 契約）的「動態」版：
// 真的並發送 K 筆 submission，每 100ms 查一次 redis `LLEN submissions:processing`，
// 斷言同時 in-flight 數不超過 worker 併發上限。
//
// in-flight 為什麼等於 LLEN submissions:processing：
//   worker.py 用 BLMOVE pending→processing 原子取件（+1），判完用 LREM 移除（-1）。
//   N 個 worker container 並排跑、每個 serial loop，所以同時 in-flight 上限 = N replica。
//
// 前置（跟其他 regression spec 一致）：
//   1. docker compose up（backend:8000 / redis / worker / minio 起著）
//   2. frontend dev server 開在 :5173（page login 走 UI）
//   3. seed：beforeAll 會跑 seed_e2e_candidate
//   測試讀 process.env.WORKER_CONCURRENCY（預設 1），需跟「stack 實際起的 replica 數」對齊。

import { test, expect } from '@playwright/test'
import { execSync } from 'node:child_process'

const REPO_ROOT_CWD = '../..'
const API_BASE = 'http://localhost:8000'

// main 的 seed_e2e_candidate 提供的 fast target（1000ms time_limit、print 兩數和、不會 TLE）
const SEEDED_CANDIDATE = { username: 'demo_candidate', password: 'password123' }
const SEEDED_EXAM_TITLE = 'E2E 進行中考試'
const FAST_PROBLEM_TITLE = '兩數相加 (demo)'
// 過 sample(3 5→8) + hidden(100 200→300) 的最小正解
const SOLUTION = 'a, b = map(int, input().split())\nprint(a + b)\n'

async function login(page, user) {
  await page.goto('/login')
  await page.locator('#username').fill(user.username)
  await page.locator('#password').fill(user.password)
  await page.getByRole('button', { name: '登入' }).click()
}

async function getCandidateToken(page) {
  await login(page, SEEDED_CANDIDATE)
  await page.waitForURL('**/candidate/exams')
  const token = await page.evaluate(() => localStorage.getItem('access_token'))
  expect(token, 'login 後應拿到 access_token').toBeTruthy()
  return token
}

async function findFastTarget(request, token) {
  const headers = { Authorization: `Bearer ${token}` }
  const examsRes = await request.get(`${API_BASE}/api/v1/exams/`, { headers })
  const seededExam = (await examsRes.json()).find((e) => e.title === SEEDED_EXAM_TITLE)
  expect(seededExam, `缺種子考試「${SEEDED_EXAM_TITLE}」；先跑 seed_e2e_candidate`).toBeTruthy()
  const detailRes = await request.get(`${API_BASE}/api/v1/exams/${seededExam.id}`, { headers })
  const detail = await detailRes.json()
  const ep = detail.exam_problems.find((x) => x.title === FAST_PROBLEM_TITLE)
  expect(ep, `「${FAST_PROBLEM_TITLE}」應在種子考試裡`).toBeTruthy()
  return { examId: seededExam.id, problemId: ep.problem_id }
}

// submissions:processing 的同時 in-flight 數
function llenProcessing() {
  const out = execSync('docker compose exec -T redis redis-cli LLEN submissions:processing', {
    cwd: REPO_ROOT_CWD,
    encoding: 'utf-8',
  })
  return parseInt(out.trim(), 10)
}

function runSeed() {
  execSync('docker compose exec -T backend python -m app.scripts.seed_e2e_candidate', {
    cwd: REPO_ROOT_CWD,
    stdio: 'inherit',
  })
}

test.beforeAll(() => {
  runSeed()
})

test('WC-RT：K 筆併發提交時 redis processing 同時 in-flight ≤ WORKER_CONCURRENCY', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000)

  const token = await getCandidateToken(page)
  const { examId, problemId } = await findFastTarget(request, token)

  // 等 processing 清空再開始，避免前一條 test 的尾巴干擾
  for (let i = 0; i < 50 && llenProcessing() > 0; i++) {
    await new Promise((r) => setTimeout(r, 500))
  }
  expect(llenProcessing(), 'processing 應已清空再開測').toBe(0)

  // 每 100ms 取樣 processing list 長度，記錄峰值
  let maxInflight = 0
  let stop = false
  const poller = (async () => {
    while (!stop) {
      try {
        const cur = llenProcessing()
        if (cur > maxInflight) maxInflight = cur
      } catch (_) {
        // 忽略 redis-cli 偶發失敗
      }
      await new Promise((r) => setTimeout(r, 100))
    }
  })()

  // 並發送 K 筆（每筆 source 略不同，避免任何 dedupe）
  const K = 5
  await Promise.all(
    Array.from({ length: K }, (_, i) =>
      request.post(`${API_BASE}/api/v1/submissions/`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          problem_id: problemId,
          exam_id: examId,
          language: 'python',
          source_code: `${SOLUTION}# inflight ${i}\n`,
          submission_type: 'OFFICIAL',
        },
      })
    )
  )

  // 等 worker 把 queue 跑完（K 筆 * judge ~1-2s + buffer）
  await new Promise((r) => setTimeout(r, 30_000))
  stop = true
  await poller

  // 配置上限：跟「stack 實際起的 worker replica 數」對齊，預設 1
  const expectedCap = parseInt(process.env.WORKER_CONCURRENCY ?? '1', 10)
  expect(
    maxInflight,
    `峰值 in-flight=${maxInflight}，配置上限 WORKER_CONCURRENCY=${expectedCap}`
  ).toBeLessThanOrEqual(expectedCap)

  // 順帶確認 queue 真的有被消化（不是因為都沒進 queue 才看起來受控）
  expect(maxInflight, 'in-flight 全程為 0 → submission 沒進 queue，測試無效').toBeGreaterThan(0)
})
