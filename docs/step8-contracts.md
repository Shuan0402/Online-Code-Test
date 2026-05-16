# Step 8 合約對齊紀錄

Step 8（worker 接 Redis queue + HTTP callback）開工前要釘死的合約。Spec：[hackmd](https://hackmd.io/@st980155/rJvy4aORWg)。

## 決議紀錄（2026-05-16）

| # | 議題 | 決定 |
|---|---|---|
| 合約 1 | Queue 機制 | ✅ **At-least-once via processing list**：`RPUSH submissions:pending` → `BLMOVE pending → processing LEFT RIGHT` → 跑完 `LREM processing 1 msg` → worker startup sweep `LMOVE processing → pending` |
| 合約 2 | S3 | ✅ **MinIO**（compose 內跑、S3-compatible）+ **Pre-signed URL** embedded in queue payload（10 分鐘 expiry） |
| 合約 3 | Callback endpoint | ✅ `POST /internal/judge-callback` + `X-Worker-Secret` header（env `WORKER_SECRET`） |
| 合約 3 | Overall verdict | ✅ Backend 從 `per_testcase` 推、worker 不回 |
| 合約 4 | Backend idempotency | ✅ **Step 8 必做**：DB PK + SQL `UPDATE WHERE status IN ('Pending', 'Judging')` guard、rowcount=0 silent 200 |
| 合約 5b | 算分 | ✅ Backend 算（worker 不收 `score_weight`） |
| 合約 5c | Worker fail strategy | ✅ Fail-fast |
| 合約 5a | RUN_ONLY 行為 | ⏸️ Pass、step 8 只做 `OFFICIAL` |

**待 Shuan 對齊**：
- 合約 1：queue name `oj_judge_queue` → `submissions:pending` rename（Pre-flight Gap 2）
- 合約 2：bucket 名 + key 結構（建議 `octest-submissions` / `{submission_id}.{ext}`）；queue 訊息欄位建議從 `code_s3_url` 改名 `presigned_url`（跟 DB column 區隔）
- 合約 3：Pydantic schema 嚴格度 / response code 統一
- 合約 4：用 (A) 直接 update `Submission` 還是 (B) 加 `submission_result_log` table（Pre-flight Gap 3）
- 合約 5a：`RUN_ONLY` 行為（推後）

---

## Pre-flight：main 現狀 vs 合約 gap

開工前要解 3 個不一致。

### Gap 1: backend 缺主流程 endpoint

`backend/app/api/api_v1/endpoints/submission.py` 上 main 只有 `POST /test-redis` debug endpoint，沒有：
- `POST /submissions`（user 提交、合約 2 流程）
- `POST /internal/judge-callback`（合約 3）

**分工建議**：`POST /submissions` 由 Shuan（D 域）寫、`POST /internal/judge-callback` 由 user（worker 配對）寫。

### Gap 2: queue_manager queue name 不一致

```python
# main: backend/app/services/queue_manager.py
self.queue_name = "oj_judge_queue"        # 合約: "submissions:pending"
self.client.rpush(self.queue_name, ...)   # 方向已對齊 ✅
```

**動作**：main rename `oj_judge_queue` → `submissions:pending`（一行常數改動）。

### Gap 3: 無獨立 result table

`Submission` 表已含 result 欄位（`status` / `score` / `execution_time` / `memory_usage` / `judge_log`）、沒獨立 `submission_result_log`。

**影響合約 4 兩種寫法**：
- (A) `UPDATE Submission SET ... WHERE id=$1 AND status IN ('Pending', 'Judging')`（推薦 step 8、不動 schema）
- (B) 加 log table + `INSERT ON CONFLICT DO NOTHING`（留 step 9 audit trail）

---

## 合約 1：Queue 訊息（backend → worker）

**Queue 操作**：
- Backend push：`RPUSH submissions:pending <json>`
- Worker consume：`BLMOVE submissions:pending submissions:processing LEFT RIGHT`（atomic、blocking）
- Worker ACK：跑完 callback 成功才 `LREM submissions:processing 1 <json>`
- Worker startup sweep：`LMOVE submissions:processing submissions:pending LEFT LEFT` loop until None

**Worker 主迴圈骨架**：

```python
# Startup sweep（撈孤兒）
while r.lmove(QUEUE_PROCESSING, QUEUE_PENDING, "LEFT", "LEFT") is not None:
    pass

# 主迴圈
while True:
    raw = r.blmove(QUEUE_PENDING, QUEUE_PROCESSING, 0, "LEFT", "RIGHT")
    msg = json.loads(raw)
    per_testcase = judge(msg)
    post_callback(msg["submission_id"], per_testcase)
    r.lrem(QUEUE_PROCESSING, 1, raw)
```

裸 `BLPOP` = at-most-once、worker SIGKILL 吞訊息；BLMOVE + sweep 升級成 at-least-once、訊息不丟但 callback 可能重複（→ 合約 4）。

**Payload 欄位**（fat payload — worker 一次拿齊、不打 backend 補資料）：

| 欄位 | 型別 | 來源 | 備註 |
|---|---|---|---|
| `submission_id` | UUID | `Submission.id` | dedupe key |
| `language` | string | `Submission.language` | `"python"` / `"cpp"` |
| `presigned_url` | string | backend 簽 MinIO pre-signed URL | worker HTTP GET 抓 source（**不是** `Submission.code_s3_url`）|
| `submission_type` | enum | `Submission.submission_type` | `RUN_ONLY` / `OFFICIAL` |
| `time_limit_ms` | int | `Problem.time_limit` | backend 要 join Problem |
| `memory_limit_mb` | int | `Problem.memory_limit` | 同上 |
| `testcases` | array | `TestCase` 表 | 含 `testcase_id` / `input_data` / `expected_output` / `is_sample`、**不含 `score_weight`** |

**範例**：

```json
{
  "submission_id": "abc-123",
  "language": "python",
  "presigned_url": "http://minio:9000/octest-submissions/abc-123.py?X-Amz-Signature=...&X-Amz-Expires=600",
  "submission_type": "OFFICIAL",
  "time_limit_ms": 1000,
  "memory_limit_mb": 256,
  "testcases": [
    {"testcase_id": 5, "input_data": "1 2", "expected_output": "3", "is_sample": true}
  ]
}
```

---

## 合約 2：S3 access（MinIO + Pre-signed URL）

**Compose service 草案**：

```yaml
minio:
  image: minio/minio:latest
  command: server /data --console-address ":9001"
  environment:
    MINIO_ROOT_USER: ${MINIO_USER}
    MINIO_ROOT_PASSWORD: ${MINIO_PASSWORD}
  volumes:
    - minio_data:/data
  ports:
    - "9000:9000"   # S3 API（backend / worker 內網用 http://minio:9000）
    - "9001:9001"   # console UI
```

**流程**：

```
1. POST /submissions { source_code, ... }
2. Backend：
   a. 上傳 source → MinIO key: octest-submissions/{submission_id}.{ext}
   b. 寫 DB: Submission.code_s3_url = 's3://octest-submissions/...' (永久 URI)
   c. 簽 pre-signed GET URL (10 分鐘 expiry)
   d. RPUSH submissions:pending {..., "presigned_url": "http://minio:9000/...?X-Amz-Signature=..."}
3. Worker BLMOVE → requests.get(presigned_url) → 跑 sandbox
```

**`code_s3_url` 命名歧義**：

| | `Submission.code_s3_url` (DB) | `presigned_url` (queue 訊息) |
|---|---|---|
| 性質 | 永久 URI、backend audit / rejudge 用 | 短期 HTTP URL、worker GET |
| 範例 | `s3://octest-submissions/abc-123.py` | `http://minio:9000/...?X-Amz-Signature=...` |

兩個是不同的東西、住在不同的地方。**待 Shuan 對齊**：bucket 名、key 結構、URL 過期時間（建議 ≥ `time_limit_ms × N_testcases + buffer`）。

---

## 合約 3：Callback API（worker → backend）

- Endpoint：`POST /internal/judge-callback`
- Auth：`X-Worker-Secret` header（env `WORKER_SECRET`、backend + worker 容器都掛同條 env）
- Response：`200` 寫入成功（含 idempotency silent no-op）/ `401` auth fail / `5xx` worker log + 不 retry

```python
def verify_worker(x_worker_secret: str = Header(...)):
    if x_worker_secret != os.getenv("WORKER_SECRET"):
        raise HTTPException(401)
```

**Payload**（不 1:1 mirror DB column）：

| 欄位 | 對應 `Submission` column | 備註 |
|---|---|---|
| `submission_id` | `id` | path param or body |
| `exec_time_ms` | `execution_time` | 最慢 testcase 或加總（待定）|
| `memory_mb` | `memory_usage` | step 9 才填、step 8 留 null |
| `judge_log` | `judge_log` | stderr / 編譯訊息 |
| `per_testcase` | — | backend 用此推 overall verdict + 算分 |

**Overall verdict**：~~不在 payload~~。Backend 從 `per_testcase` 用 precedence 推（CE > RE > MLE > TLE > WA > AC）。

**`per_testcase` 結構**：

```json
[
  {"testcase_id": 5, "case_verdict": "AC",  "exec_time_ms": 234},
  {"testcase_id": 6, "case_verdict": "TLE", "exec_time_ms": 1001}
]
```

Fail-fast：worker 遇第一個 `case_verdict != "AC"` 就停、array 只含跑過的 testcases。

---

## 合約 4：失敗 / retry 路徑

```
backend ──RPUSH──→ Redis ──BLMOVE──→ worker ──docker run──→ sandbox
   ↑               ↓                   │              ↓
   │         processing list           │           結果
   │               ↑                   │
   │               └── sweep ── worker startup
   │                                   │
   │←──── callback (HTTP) ─────────────┘
   │                                   │
   │                          worker 跑完才 LREM processing
```

**6 個失敗情境**：

| # | 情境 | 誰負責 | Step 8 策略 |
|---|---|---|---|
| 1 | Docker daemon 掛 / image 不在 | Worker | log + ACK + 不 NACK |
| 2 | Callback HTTP 失敗（backend 5xx / network） | Worker | log + 放棄（不 LREM）→ sweep 後援；step 9 才加 retry/DLQ |
| 3 | Worker 中途死（OOM / SIGKILL）| Sweep + 新 worker | 訊息卡 processing → 新 worker sweep 撈回 → 重做 → **callback 必送兩次** |
| 4 | Worker 連不上 Redis | Worker | Reconnect / 退場讓 supervisor 拉回 |
| 5 | Backend 收同 `submission_id` 重複 callback | Backend | **必須 idempotent**（見下方）|
| 6 | `POST /problems/{id}/rejudge` | Backend → 重 RPUSH | 同 #5、靠 idempotency 兜底 |

**核心紀律**：at-least-once → callback 必然偶爾重複 → backend handler **必須 idempotent**。分散式系統三選二（不丟 / 不重 / 分散式）—— 我們選「不丟 + 分散式」、吞「可能重」這個代價、靠 receiver 容忍。

**Backend idempotency（Step 8 必做）**：

Layer 1 — DB schema：`Submission.id` 已是 PK（PG 自動 UNIQUE）、不用動 schema。

Layer 2 — SQL guard（無獨立 log table、直接 update Submission）：

```python
from sqlalchemy import text

result = db.execute(
    text("""
        UPDATE submissions
           SET status = :verdict,
               score = :score,
               execution_time = :exec_ms,
               memory_usage = :mem_mb,
               judge_log = :log
         WHERE id = :sub_id
           AND status IN ('Pending', 'Judging')
    """),
    {...},
)
db.commit()

if result.rowcount == 0:
    log.info(f"duplicate callback for {sub_id}, no-op")
return Response(status_code=200)
```

PG 對單一 SQL UPDATE 取 row lock、兩個 worker 同時 callback 只有一個贏（其他 rowcount=0）、不用 application-level mutex / SELECT-then-UPDATE。

**Worker 紀律**：callback HTTP 失敗 **0 次 retry**；`SpawnerError` graceful + ACK + log。

---

## 合約 5：判題行為

### 5a. `submission_type`（⏸️ 待 Shuan 對齊）

| Type | step 8 行為 |
|---|---|
| `OFFICIAL` | 跑全部 testcases、結果寫回 |
| `RUN_ONLY` | 待定（候選：只跑 sample / 跑全部不寫 result） |

Step 8 worker：`if submission_type == "OFFICIAL": ... else: raise NotImplementedError`。

### 5b. Score 算法（✅ Backend 算分）

Worker 回 `per_testcase`、backend 對每 case 查 `score_weight` 加權。Worker = platform 層、backend = semantic 層；未來計分規則演進只動 backend。

### 5c. Worker fail-fast（✅）

For loop 遇第一個非 AC 就 break；`per_testcase` 只含跑過的（包括 fail 那筆）；backend 推 overall 時沒在 array 的 testcases 視為「未測試」。理由：worst-case latency 可預測。

---

## 欄位來源總表

| Table | → queue payload | ← callback 寫回 |
|---|---|---|
| `Submission` | `id`, `language`, `submission_type` | `status`, `score`, `execution_time`, `memory_usage`, `judge_log`（透過 UPDATE WHERE status IN guard）|
| `Problem` | `time_limit`, `memory_limit` | — |
| `TestCase` | array（不含 `score_weight`）| backend 用 `score_weight` 算分 |
| 新合約 | `presigned_url`、Redis key、JSON envelope | `X-Worker-Secret` header |

---

## 開工順序建議

0. **Pre-flight gap**：補 backend 主流程 endpoint（gap 1）、rename queue_manager queue name（gap 2）、確認 idempotency 寫法 (A)（gap 3）
1. **MinIO**：compose `minio` service + backend 上傳 + presigned URL + worker `requests.get`
2. **Worker 主迴圈**：startup sweep → BLMOVE → judge（fail-fast、`decide_verdict()` 每 case）→ callback（per_testcase array）→ LREM
3. **Submission type**：`OFFICIAL` 路徑、`RUN_ONLY` stub `NotImplementedError`
4. **Backend callback handler**：兩層 idempotency（DB PK + SQL UPDATE WHERE guard）
5. **Integration test**：sandbox smoke / DockerSpawner / `test_malicious` assert / **callback idempotency**（POST 兩次驗只動 DB 一次）/ **queue redelivery**（kill worker mid-judge 驗 sweep + 重做）
6. **Step 9+**：NACK / DLQ / monitoring / `RUN_ONLY` / rejudge / 多 worker scaling
