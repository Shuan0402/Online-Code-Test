# Step 8 合約對齊紀錄

Step 8（worker 接 Redis queue + HTTP callback）開工前要釘死的合約。Spec：[hackmd](https://hackmd.io/@st980155/rJvy4aORWg)。

## 決議紀錄（2026-05-16）

| # | 議題 | 決定 |
|---|---|---|
| 合約 1 | Queue 結構 | ✅ Redis **list** (`LPUSH` / `BRPOP`)、JSON 編碼、不外包 envelope、key = `submissions:pending` |
| 合約 2 | S3 替代方案 | ✅ **MinIO**（compose 內跑、S3-compatible） |
| 合約 2 | Worker access | ✅ **Pre-signed URL**（backend 簽好塞 queue 訊息、10 分鐘 expiry）|
| 合約 3 | Endpoint | ✅ 專屬 **`POST /internal/judge-callback`** |
| 合約 3 | Auth | ✅ **Shared secret header** `X-Worker-Secret: <secret>`（從 env `WORKER_SECRET`） |
| 合約 3 | Overall verdict 誰算 | ✅ **Backend 從 per_testcase 推**、worker 不回 overall verdict |
| 合約 5b | 誰算分 | ✅ **Backend 算分**（worker 回 per_testcase array、backend 用 score_weight 加權）|
| 合約 5c | Worker fail strategy | ✅ **Fail-fast**（一 testcase fail 就停、不跑剩下的）|
| 合約 4 | Backend idempotency | ⏸️ **推後** — Step 8 單 worker 不卡，等準備多 worker / rejudge 時再對齊 |
| 合約 5a | RUN_ONLY 行為 | ⏸️ Pass、之後跟 Shuan 討論；step 8 先做 `OFFICIAL` |

**仍待 Shuan 對齊**（含本紀錄裡的建議方向、Shuan 可挑戰）：
- 合約 2 MinIO bucket 名稱 + key 結構（建議 `octest-submissions` / `{submission_id}.{ext}`）
- 合約 2 `code_s3_url` 命名歧義：DB column（永久 URI）跟 queue 訊息欄位（短期 pre-signed URL）是不同東西，建議 queue 訊息欄位改名 `presigned_url`
- 合約 3 Pydantic schema 驗證、response codes 對齊
- 合約 4 idempotency 實作（推後）
- 合約 5a RUN_ONLY 行為（推後）

---

## 合約 1：Queue 訊息（backend → worker）

**目的**：backend 收到 submission 後把判題工作派給 worker。

**已決議**：
- Redis key：`submissions:pending`
- Queue 結構：Redis **list** (`LPUSH` / `BRPOP`) — step 8 demo 夠用；step 9 要做 NACK / consumer group 才升級 stream
- 訊息編碼：JSON
- Envelope：**不外包**，訊息直接是欄位（不 wrap `{"event": "...", "payload": {...}}` 多餘外殼）

**Payload 欄位（fat payload — worker 一次拿齊）**：

| 欄位 | 型別 | 來源 | 必填 | 備註 |
|---|---|---|---|---|
| `submission_id` | UUID | `Submission.id` | ✅ | dedupe key、idempotency 用 |
| `language` | string | `Submission.language` | ✅ | `"python"` / `"cpp"` |
| `presigned_url` | string | backend 簽 MinIO pre-signed URL | ✅ | 配合合約 2、worker 用 HTTP GET 抓 source code（**不是** Submission.code_s3_url 那條 DB 欄位）|
| `submission_type` | enum | `Submission.submission_type` | ✅ | `RUN_ONLY` / `OFFICIAL`（連合約 5）|
| `time_limit_ms` | int | **`Problem.time_limit`** | ✅ | Submission 沒這欄、backend 要 join Problem |
| `memory_limit_mb` | int | **`Problem.memory_limit`** | ✅ | 同上 |
| `testcases` | array | **`TestCase` 表** | ✅ | 見下 |

**完整訊息範例**：

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

**`testcases` array 結構**：

```json
[
  {
    "testcase_id": 5,
    "input_data": "1 2",
    "expected_output": "3",
    "is_sample": true
  }
]
```

來源：`TestCase.id` / `input_data` / `expected_output` / `is_sample`。

**Worker 不必收 `score_weight`** — 計分是 backend 的事（決議：backend 算分）。Worker 只負責跑 testcases、回每個結果。

**設計風格**：fat payload 推薦 — worker 不打 backend 補資料、解耦 + 少失敗點。Slim（只傳 ID）會讓 worker 強耦合 backend API + 多 N 次 HTTP。

---

## 合約 2：S3 access（採用 MinIO ✅）

**目的**：worker 從 `code_s3_url` 拿 source code。

**已決定**：採用 MinIO（S3-compatible、跑在 docker compose 內、免錢、未來搬 AWS S3 0 修改）。

**Compose 新增 service 草案**：

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
    - "9000:9000"   # S3 API（backend / worker 內部用 http://minio:9000 連）
    - "9001:9001"   # console UI（瀏覽器看 bucket 用）
```

**Worker access 已決議：Pre-signed URL embedded in queue payload**

完整流程：

```
1. 考生 POST /submissions { source_code, ... }
2. Backend:
   a. 上傳 source_code → MinIO key: octest-submissions/{submission_id}.{ext}
   b. 寫 DB: Submission.code_s3_url = 's3://octest-submissions/...' (永久 URI、給 backend 用)
   c. MinIO SDK 簽 pre-signed GET URL (10 分鐘 expiry)
   d. LPUSH submissions:pending {
        "presigned_url": "http://minio:9000/...?X-Amz-Signature=...",
        ...
      }
3. Worker BRPOP → requests.get(presigned_url) → 抓到 source code → 跑 sandbox
```

**注意 `code_s3_url` 命名歧義**：

| | DB column `Submission.code_s3_url` | Queue 訊息欄位 `presigned_url`（建議名）|
|---|---|---|
| 性質 | 永久內部 URI、給 backend 自己用（rejudge / audit） | 短期 HTTP URL、給 worker GET |
| 範例 | `s3://octest-submissions/abc-123.py` | `http://minio:9000/octest-submissions/abc-123.py?X-Amz-Signature=...` |
| 流動 | 不出現在 queue 訊息 | 不寫進 DB |

兩個是不同的東西、住在不同的地方。本紀錄統一用 `presigned_url` 命名 queue 訊息欄位、避免跟 DB column 混淆。

**還要跟 Shuan 對齊**：
- Bucket 名稱（建議：`octest-submissions`）
- Key 結構（建議：`{submission_id}.{ext}`、例 `abc-123.py`）
- URL 過期時間（建議 10 分鐘 = ≥ `time_limit_ms × N_testcases + buffer`）

---

## 合約 3：Callback API（worker → backend）

**目的**：worker 跑完判題、回報結果給 backend。

**已決議**：
- Endpoint URL：專屬 `POST /internal/judge-callback`（worker-only、路徑分明）
- Auth：shared secret header `X-Worker-Secret: <secret>`、secret 從 env `WORKER_SECRET`（backend 跟 worker 容器都掛同一條 env）
- HTTP method：POST
- Response codes：`200` 寫入成功 / `401` auth fail / `409` idempotency 拒絕（已 finalized、見合約 4）/ `5xx` backend 內部錯（worker log + 不 retry）

Backend FastAPI middleware 範例：

```python
def verify_worker(x_worker_secret: str = Header(...)):
    if x_worker_secret != os.getenv("WORKER_SECRET"):
        raise HTTPException(401)
```

**還要跟 Shuan 對齊**：
- Body Pydantic schema 嚴格度（決定 worker 傳的欄位名 / 型別）
- 細部 response code 跟 backend 統一錯誤格式

**Payload 欄位草案（建議解耦版，不 1:1 mirror DB column）**：

| 欄位 | 型別 | 對應 `Submission` column | 必填 | 備註 |
|---|---|---|---|---|
| `submission_id` | UUID | `id` | ✅ | path param 或 body 都行 |
| `exec_time_ms` | int | `execution_time` | ✅ | 最慢 testcase 或加總（待定）|
| `memory_mb` | int | `memory_usage` | ⚠️ | Step 9 才填、step 8 留 null |
| `judge_log` | text | `judge_log` | ✅ | stderr / 編譯訊息 |
| `per_testcase` | array | — | ✅ | backend 用此推 overall verdict + 算分 |

**注意**：~~`verdict` 欄位~~ 已決議**不放在 callback payload** — backend 從 `per_testcase` 推 overall verdict（任一 TLE → overall TLE、任一 RE → overall RE、全 AC → overall AC）。

**`per_testcase` 結構**（每個 case 含獨立 verdict，讓 backend 既能算分也能推 overall）：

```json
[
  {"testcase_id": 5, "case_verdict": "AC",  "exec_time_ms": 234},
  {"testcase_id": 6, "case_verdict": "TLE", "exec_time_ms": 1001}
]
```

- `case_verdict`：AC / WA / TLE / MLE / RE / CE — worker 對每個 testcase 用 step 7 寫的 `decide_verdict()` 算
- Backend 推 overall：`case_verdict == "AC"` 視為 passed；overall 由所有 cases 的 verdict 用 precedence 推（CE > RE > MLE > TLE > WA > AC）
- Fail-fast：worker 遇到第一個 `case_verdict != "AC"` 就停、剩下 testcases 不出現在 array 裡（backend 推 overall 時忽略「沒跑到的」即可）

---

## 合約 4：失敗 / retry 路徑

**這條合約在講什麼**：**不是**「backend retry worker 幾次」這種單一方向，而是「整條鏈上任一節點壞掉，誰負責 retry 或丟掉」。

```
backend ──LPUSH──→ Redis ──BRPOP──→ worker ──docker run──→ sandbox
   ↑                                   │              ↓
   │                                   │           結果
   │←─────── callback (HTTP) ──────────┘
```

每個箭頭都可能斷、每種斷法處理方式不同。

**要對齊（6 個失敗點）**：

| # | 失敗情境 | 誰負責 | 要決定的事 |
|---|---|---|---|
| 1 | Worker 拿到訊息但 docker daemon 掛 / image 不在 | **Worker** | 訊息 NACK 回 queue 讓別人試 / 寫 dead letter / 判 RE？ |
| 2 | Worker 跑完、callback 給 backend 時 backend 5xx 或 network 斷 | **Worker** | 自己 retry 幾次？interval？放棄後把訊息丟回 queue / log + 放棄？ |
| 3 | Worker process 中途死（OOM / SIGKILL / container 重啟）| **Queue + 新 worker** | Queue 偵測沒 ACK → redeliver 給別的 worker（at-least-once）→ **訊息會被處理 ≥2 次** |
| 4 | Worker 連不上 Redis | **Worker** | Reconnect / 退場讓 supervisor 拉回來？ |
| 5 | Backend 收到同一個 `submission_id` 重複 callback | **Backend** | First-write-wins / last-write-wins / reject (HTTP 409)？|
| 6 | Backend 觸發 `POST /problems/{id}/rejudge`（spec 有此 endpoint）| Backend → 重 enqueue | 跟 #5 同性質、都要 worker idempotent |

**Backend 對「worker 壞掉」的感知**：backend 把訊息丟進 queue 就脫手了，worker 壞了它沒立刻知道。Backend 唯一感覺得到的是：
- (a) Submission 卡 `Judging` 太久 → 要不要寫監控 / 告警？
- (b) 收到重複 callback → 怎麼處理（情境 #5）

**核心紀律：Worker 必須 idempotent**

同一個 `submission_id` 被處理 N 次，結果跟處理 1 次一樣。這條紀律 enable 了情境 #3 / #5 / #6。Worker 端只要保證「跑完一定 callback」即可，去重靠 backend。

**Backend idempotency 實作（⏸️ 推後 — Step 8 不卡）**

Step 8 是單 worker 跑、callback 不 retry（log + 放棄），race condition 機率極低，可以先不做 backend idempotency。**等準備上多 worker / rejudge 功能時再對齊**。

到時建議實作（記下來避免之後重新討論）：backend 收 callback 時加 1 行 status check：

```python
if submission.status not in (Pending, Judging):
    return 409   # already finalized — 重複 callback 拒絕
```

**Step 8 期間 worker 端的紀律**：
- Callback HTTP 失敗時 **0 次 retry**（log + 放棄、避免 race）
- 不要手動殺 worker process 看 redelivery 行為（這條等 backend idempotency 做完再驗）

---

## 合約 5：判題行為決定（行為，非欄位）

### 5a. `submission_type` 對應的判題範圍（⏸️ Pass、之後跟 Shuan 討論）

| Type | step 8 行為 |
|---|---|
| `OFFICIAL` | ✅ 跑全部 testcases、結果寫進 Submission |
| `RUN_ONLY` | ⏸️ 暫時 pass、行為待定（候選：只跑 sample / 跑全部 / 結果不寫 Submission） |

**Step 8 開工策略**：先實作 `OFFICIAL` 路徑、`RUN_ONLY` 留待 Shuan 對齊後補。Worker 內部可以先寫 `if submission_type == "OFFICIAL": ... else: raise NotImplementedError`。

### 5b. Score 算法歸屬（✅ Backend 算分）

**已決定：Backend 算分**。

- Worker 回 `per_testcase` array（含 `case_verdict`）
- Backend 對每個 testcase 查 `score_weight`、加總過了的 weight 得 final score
- Worker 不必知道 `score_weight`、不必算分

對齊 step 6 已建立的分層紀律：
- Worker = platform 層（跑 sandbox、報告事實）
- Backend = semantic 層（業務邏輯含計分）

未來計分規則演進（partial credit、penalty、bonus）只動 backend、worker 不必改。

### 5c. Worker fail-fast 行為（✅ Fail-fast）

**已決定：Fail-fast**。

- Worker for loop 跑 testcases，遇到第一個 `case_verdict != "AC"` 就 `break`
- 剩下 testcases 不跑
- `per_testcase` array 裡只有「跑到的」testcases（包括 fail 的那個）
- Backend 推 overall verdict 時，沒在 array 裡的 testcases 視為「未測試 / 不影響 overall」

理由：worst case latency 可預測（不會 N × time_limit 連續燒）；考生看不到後面 testcases 可接受、demo path 簡單。

---

## 欄位來源總表（按 table 看）

| Table | 提供給 queue payload | 提供給 callback（接收欄位）|
|---|---|---|
| `Submission` | `id`, `language`, `submission_type`（不含 `code_s3_url`：worker 看的是 backend 簽好的 `presigned_url`）| 寫回 `status`, `score`, `execution_time`, `memory_usage`, `judge_log` |
| `Problem` | `time_limit`, `memory_limit` | — |
| `TestCase` | 整個 array（`id` / `input_data` / `expected_output` / `is_sample`，**不含 `score_weight`** — backend 自己加權）| backend 用 `score_weight` 算分 |
| 新合約（不在任何 table） | `presigned_url`（短期、來自 backend 簽 MinIO）、Redis key、JSON envelope | `X-Worker-Secret` header |

---

## 開工順序建議

1. **找 Shuan 對齊剩餘細節**（見頂端「仍待 Shuan 對齊」清單）— MinIO bucket/key 命名、`presigned_url` 改名、callback Pydantic schema
2. **MinIO 接入**：compose 加 `minio` service、backend 上傳 source code + 簽 pre-signed URL、worker `requests.get` 抓
3. **Worker 主迴圈**：BRPOP → 抓 source code → 跑 testcases（fail-fast、用 step 7 的 `decide_verdict()` 對每 case 算 `case_verdict`）→ POST callback（含 per_testcase array）
4. **Submission_type 處理**：先做 `OFFICIAL` 路徑、`RUN_ONLY` 留 `raise NotImplementedError` stub
5. **Worker 失敗處理（最簡版）**：callback HTTP 失敗 log + 不 retry；`SpawnerError` graceful + ACK + log
6. **Integration test**：sandbox image smoke、DockerSpawner 真跑 docker、`test_malicious` 改 assert-based
7. **Step 9+**：補完整 NACK / DLQ / monitoring / `RUN_ONLY` 行為 / `Rejudge` endpoint / backend idempotency / 多 worker scaling
