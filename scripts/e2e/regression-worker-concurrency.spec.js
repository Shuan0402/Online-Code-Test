// Worker 併發上限回歸（OJ 系統工程師 Story 1 AC2）
//
// 「Worker 應依照配置的併發上限控制同時執行的沙箱數量」的實作 =
//   docker-compose.yml 的 worker.deploy.replicas: ${WORKER_CONCURRENCY:-1}
// 多開 N 個 judge-worker container，每個仍是 serial loop（while True: consume_once），
// N 個並排吃 redis queue（BLMOVE 原子，不會搶到同一筆），同時 in-flight 上限 = N。
//
// 這支是「自包含」契約測試：只靠 `docker compose config` 驗證 compose 確實把
// WORKER_CONCURRENCY 展開成 worker 的 replicas 數，不需要起整套 stack、不依賴任何 seed。
// （runtime 層級「實際同時 in-flight ≤ N」的驗證需要完整 stack + 提交流程，另案處理。）

import { test, expect } from '@playwright/test'
import { execSync } from 'node:child_process'

const REPO_ROOT_CWD = '../..'

// 用指定的 WORKER_CONCURRENCY 跑 `docker compose config`，回傳 parse 後的 worker service
function workerConfig(concurrency) {
  const env = { ...process.env }
  if (concurrency === undefined) {
    delete env.WORKER_CONCURRENCY // 測「不設」時的預設行為
  } else {
    env.WORKER_CONCURRENCY = String(concurrency)
  }
  const out = execSync('docker compose config --format json', {
    cwd: REPO_ROOT_CWD,
    encoding: 'utf-8',
    env,
  })
  const config = JSON.parse(out)
  expect(config.services.worker, 'worker service 應存在於 compose config').toBeTruthy()
  return config.services.worker
}

test('WC-1：不設 WORKER_CONCURRENCY 時 worker 預設 1 replica', () => {
  const worker = workerConfig(undefined)
  expect(worker.deploy?.replicas, 'worker.deploy.replicas 預設應為 1').toBe(1)
})

test('WC-2：WORKER_CONCURRENCY=4 時 worker 展開成 4 replicas', () => {
  const worker = workerConfig(4)
  expect(worker.deploy?.replicas, 'WORKER_CONCURRENCY=4 應使 replicas=4').toBe(4)
})

test('WC-3：worker 不得設 container_name / ports（否則 scale 會撞名、無法多開）', () => {
  const worker = workerConfig(2)
  // 固定 container_name 會讓 docker 無法把同一服務複製成多份（名字唯一性衝突）
  expect(worker.container_name, 'worker 不應有固定 container_name').toBeFalsy()
  // worker 是 outbound-only（BLMOVE redis + POST backend），有 published port 也會在 scale 時撞 port
  const published = (worker.ports ?? []).filter((p) => p?.published)
  expect(published, 'worker 不應 publish host port').toHaveLength(0)
})
