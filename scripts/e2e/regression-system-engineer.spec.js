// L2 regression：OJ 系統工程師 Advanced Story 回歸
// （對應 HackMD「Advanced Requirement 專屬 User Story」之 OJ 工程師 Story 1+2）
//
// 前置條件：跟 regression-questioner.spec.js 共用 seed_e2e_questioner 提供的
// candidate (e2e_q_candidate) + Ongoing exam + E2E-Q-Partial 題目 (time_limit_ms=2000)
// 拿來當「快、不會 TLE」的 submission target。
//
// 編號對照：
//   SE-1.1 : Story 1 AC1 高併發削峰填谷
//   SE-1.2 : Story 1 AC2 Worker 併發數限額控制
//   SE-2.1 : Story 2 AC1 多容器網路互聯與一鍵建置
//   SE-2.2 : Story 2 AC2 環境變數與網路邊界穿透

import { test, expect } from '@playwright/test'
import { execSync } from 'node:child_process'

const REPO_ROOT_CWD = '../..'
const API_BASE = 'http://localhost:8000'
const SEEDED_CANDIDATE = {
  username: 'e2e_q_candidate@nthu.edu.tw',
  password: 'password123',
}
const SEEDED_EXAM_TITLE = 'E2E Q 沙箱回歸考試'
const FAST_PROBLEM_TITLE = 'E2E-Q-Partial' // 2000ms time_limit、很快會判完

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
  expect(token).toBeTruthy()
  return token
}

async function findFastTarget(request, token) {
  const headers = { Authorization: `Bearer ${token}` }
  const examsRes = await request.get(`${API_BASE}/api/v1/exams/`, { headers })
  const seededExam = (await examsRes.json()).find((e) => e.title === SEEDED_EXAM_TITLE)
  expect(seededExam, 'Q seed exam should exist; run regression-questioner first').toBeTruthy()
  const detailRes = await request.get(`${API_BASE}/api/v1/exams/${seededExam.id}`, { headers })
  const detail = await detailRes.json()
  const ep = detail.exam_problems.find((x) => x.title === FAST_PROBLEM_TITLE)
  expect(ep, `${FAST_PROBLEM_TITLE} should be in seeded exam`).toBeTruthy()
  return { examId: seededExam.id, problemId: ep.problem_id }
}

function runSeed() {
  execSync('docker compose exec -T backend python -m app.scripts.seed_e2e_questioner', {
    cwd: REPO_ROOT_CWD,
    stdio: 'inherit',
  })
}

function llenProcessing() {
  // submissions:processing 的同時 in-flight 數
  const out = execSync(
    `docker compose exec -T redis redis-cli LLEN submissions:processing`,
    { cwd: REPO_ROOT_CWD, encoding: 'utf-8' }
  )
  return parseInt(out.trim(), 10)
}

test.beforeAll(() => {
  runSeed()
})

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Story 1 — 異步排隊解耦與高併發防護                                    ║
// ╚══════════════════════════════════════════════════════════════════════╝

// SE-1.1：高併發 POST submission 應該 fire-and-forget、不阻塞等 judge 跑完
test('SE-1.1：20 筆併發提交、p95 回應時間 < 2s 且立刻拿到非終結狀態', async ({ page, request }) => {
  test.setTimeout(90_000)

  const token = await getCandidateToken(page)
  const { examId, problemId } = await findFastTarget(request, token)

  const N = 20
  const promises = Array.from({ length: N }, async (_, i) => {
    const start = Date.now()
    const res = await request.post(`${API_BASE}/api/v1/submissions/`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        problem_id: problemId,
        exam_id: examId,
        language: 'python',
        // 故意每筆不同 source、避免 backend 任何 dedupe 把後面打掉
        source_code: `print("hello A")  # SE-1.1 burst ${i}\n`,
        submission_type: 'OFFICIAL',
      },
    })
    const rt = Date.now() - start
    expect(res.ok(), `submission #${i} should be accepted (got ${res.status()})`).toBeTruthy()
    const body = await res.json()
    return { rt, status: body.status, id: body.id }
  })

  const results = await Promise.all(promises)
  const rts = results.map((r) => r.rt).sort((a, b) => a - b)
  const p95 = rts[Math.min(rts.length - 1, Math.floor(rts.length * 0.95))]

  // 削峰：每筆 POST 應該 fire-and-forget、不等 judge 跑完
  expect(p95, `p95 RT=${p95}ms，全部 RT: ${rts.join(',')}`).toBeLessThan(2000)

  // 拿到 response 時 judge 還在排隊或剛開始跑、不可能已經有 AC/WA 等終結狀態
  for (const r of results) {
    expect(['Pending', 'Judging'], `submission ${r.id} status=${r.status}`).toContain(r.status)
  }
})

// SE-1.1 補：POST submission 後 MinIO bucket 應該真的有對應 source code object
// 既有 SE-1.1 只驗 RT、隱含「寫入 MinIO + push Redis」都成功；這條分離驗 MinIO 真的有寫
test('SE-1.1 補：POST 後 MinIO bucket 應出現 {submission_id}.py object', async ({ page, request }) => {
  test.setTimeout(60_000)

  const token = await getCandidateToken(page)
  const { examId, problemId } = await findFastTarget(request, token)

  const createRes = await request.post(`${API_BASE}/api/v1/submissions/`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      problem_id: problemId,
      exam_id: examId,
      language: 'python',
      source_code: 'print("hello A")  # SE-1.1 minio verify\n',
      submission_type: 'OFFICIAL',
    },
  })
  expect(createRes.ok()).toBeTruthy()
  const sub = await createRes.json()
  const expectedKey = `${sub.id}.py`

  // MinIO 物件路徑模式（storage.py upload_source）：{submission_id}.{ext}
  // 直接 ls /data/<bucket>/ 看 key dir 存不存在（mc alias 沒設、用 fs 觀察）
  const lsOut = execSync(
    `docker compose exec -T minio ls /data/octest-submissions/`,
    { cwd: REPO_ROOT_CWD, encoding: 'utf-8' }
  )
  expect(
    lsOut,
    `MinIO bucket 缺 ${expectedKey} → backend 沒實際寫入 MinIO`
  ).toContain(expectedKey)
})

// SE-1.2：Worker 的同時 in-flight 沙箱數應該受控、不會無限長
test('SE-1.2：5 筆併發提交時 redis processing list 同時 in-flight 數受控', async ({ page, request }) => {
  test.setTimeout(120_000)

  const token = await getCandidateToken(page)
  const { examId, problemId } = await findFastTarget(request, token)

  // 等 redis processing 清空再開始（避免上一條 test 的尾巴干擾）
  for (let i = 0; i < 50 && llenProcessing() > 0; i++) {
    await new Promise((r) => setTimeout(r, 500))
  }
  expect(llenProcessing()).toBe(0)

  // 啟動 polling、每 100ms 查一次 processing list
  let maxInflight = 0
  let stop = false
  const poller = (async () => {
    while (!stop) {
      try {
        const cur = llenProcessing()
        if (cur > maxInflight) maxInflight = cur
      } catch (_) {
        // ignore transient redis-cli failures
      }
      await new Promise((r) => setTimeout(r, 100))
    }
  })()

  // 並發送 5 筆
  const K = 5
  await Promise.all(
    Array.from({ length: K }, (_, i) =>
      request.post(`${API_BASE}/api/v1/submissions/`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          problem_id: problemId,
          exam_id: examId,
          language: 'python',
          source_code: `print("hello A")  # SE-1.2 inflight ${i}\n`,
          submission_type: 'OFFICIAL',
        },
      })
    )
  )

  // 等 worker 把 queue 跑完（5 筆 * judge ~2s ≈ 10s + buffer）
  await new Promise((r) => setTimeout(r, 30_000))
  stop = true
  await poller

  // SPEC「依照配置的併發上限」實作 = docker compose worker `deploy.replicas:
  // ${WORKER_CONCURRENCY:-1}`。每個 worker container 仍是 serial loop、N 個 container
  // 並排吃 redis（BLMOVE 原子），所以同時 in-flight 上限 = WORKER_CONCURRENCY。
  // 測試讀同名 env、預設 1，跟 compose 預設對齊。
  const expectedCap = parseInt(process.env.WORKER_CONCURRENCY ?? '1', 10)
  expect(
    maxInflight,
    `max in-flight = ${maxInflight}，配置上限 WORKER_CONCURRENCY = ${expectedCap}`
  ).toBeLessThanOrEqual(expectedCap)
})

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Story 2 — 容器化一鍵易部署架構                                        ║
// ╚══════════════════════════════════════════════════════════════════════╝

// SE-2.1：docker compose config 合法 + 必要 services 都跑著且 healthy
test('SE-2.1：docker compose 起得起來、核心 services 都 healthy', () => {
  // docker compose config 必須 parse 成功（compose schema 合法）
  const config = execSync('docker compose config', {
    cwd: REPO_ROOT_CWD,
    encoding: 'utf-8',
  })

  // 核心 services 必須都在 compose 設定裡
  for (const svc of ['backend', 'worker', 'pg', 'redis', 'minio']) {
    expect(config, `service ${svc} not in compose config`).toMatch(
      new RegExp(`^  ${svc}:`, 'm')
    )
  }

  // 撈 ps，狀態必須符合：核心都 Up，有 healthcheck 的（backend/pg/redis/minio）必須 healthy
  // 用 --format json，docker compose 每行回一個 service JSON
  const psOut = execSync('docker compose ps --format json', {
    cwd: REPO_ROOT_CWD,
    encoding: 'utf-8',
  })
  const services = psOut
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))

  for (const svc of ['backend', 'pg', 'redis', 'minio']) {
    const found = services.find((s) => s.Service === svc)
    expect(found, `service ${svc} not running`).toBeTruthy()
    expect(found.Health, `service ${svc} health = ${found.Health}`).toBe('healthy')
  }

  // worker 沒掛 healthcheck（spec 內註解：no HTTP endpoint exposed）；只要在跑就 OK
  const w = services.find((s) => s.Service === 'worker')
  expect(w, 'worker not running').toBeTruthy()
  expect(w.State).toBe('running')
})

// SE-2.2：環境變數從 .env 注入、內網用 service name 解析（非 hardcoded IP）
test('SE-2.2：backend / worker 容器讀到的關鍵 env 走 service-name 邊界', () => {
  // backend：讀到 POSTGRES_HOST=pg、MINIO_ENDPOINT=http://minio:9000、REDIS_HOST=redis
  const backendEnv = execSync('docker compose exec -T backend env', {
    cwd: REPO_ROOT_CWD,
    encoding: 'utf-8',
  })
  expect(backendEnv).toMatch(/^POSTGRES_HOST=pg$/m)
  expect(backendEnv).toMatch(/^MINIO_ENDPOINT=http:\/\/minio:9000$/m)
  expect(backendEnv).toMatch(/^REDIS_HOST=redis$/m)
  // .env 注入確認：MINIO_USER / JWT_SECRET / WORKER_SECRET 都不該空字串
  for (const key of ['MINIO_USER', 'JWT_SECRET', 'WORKER_SECRET']) {
    const m = backendEnv.match(new RegExp(`^${key}=(.*)$`, 'm'))
    expect(m, `${key} not in backend env`).toBeTruthy()
    expect(m[1].length, `${key} is empty`).toBeGreaterThan(0)
  }

  // worker：REDIS_URL / BACKEND_URL 必須走 service name
  const workerEnv = execSync('docker compose exec -T worker env', {
    cwd: REPO_ROOT_CWD,
    encoding: 'utf-8',
  })
  expect(workerEnv).toMatch(/^REDIS_URL=redis:\/\/redis:6379/m)
  expect(workerEnv).toMatch(/^BACKEND_URL=http:\/\/backend:8000/m)

  // 邊界穿透：host 從外部能打到 backend:8000 / minio:9000（port-mapped）
  // execSync curl，return 非 0 會 throw
  execSync('curl -sf http://localhost:8000/health -o /dev/null', { encoding: 'utf-8' })
  execSync('curl -sf http://localhost:9000/minio/health/live -o /dev/null', {
    encoding: 'utf-8',
  })
})
