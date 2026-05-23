# 判題失敗處理合約（Judge Failure Handling）

當 worker 判題流程任何一段壞掉時、系統要怎麼處理：哪裡 retry、哪裡放棄、user 看到什麼、admin 看到什麼。
延續 Step 8（PR #16 / #17）的成功路徑、補完 Step 8 故意先漏掉的失敗路徑。Spec：[hackmd](https://hackmd.io/@st980155/rJvy4aORWg)。

> **歷史紀錄**：原始草案有 cross-process retry counter（Redis XPENDING）/ NACK protocol / DLQ Redis stream / 4 個 exception class、是 production-grade reliability story。Senior 過度設計 audit 後砍掉約 40% 程式量、留下這份「100 學生 + docker-compose scale 剛好夠」的版本。失敗紀錄統一交給 Step 10 logging-infra（Loki）處理、不在本 step 自製 DLQ。

## 決議紀錄（2026-05-23）

| # | 議題 | 決定 |
|---|---|---|
| 9-Q1 | retry_count 存哪 | ✅ 不存跨進程、L3 in-worker retry 用 worker process 內 local 變數 |
| 9-Q2 | MAX_RETRIES 值 | ✅ pre-callback (L1/L2) = 0；callback (L3) = 1 retry @1s |
| 9-Q3 | 失敗分類 | ✅ 不分 exception class、單 `except Exception` 一網打盡；只區分「pre-callback fail」vs「callback fail」 |
| 9-Q4 | Endpoint | ✅ 沿用 `POST /internal/judge-callback` + 新 verdict `JudgeFailed` + 新 optional 欄位 `failure_reason` |
| 9-Q5 | 失敗訊息收集 | ✅ Worker 寫 stderr、Step 10 上 Loki 後自動撈進 Grafana；**不做 DLQ Redis stream、不做 file mount**（12-factor 紀律） |
| 9-Q6 | 前端呈現 | ✅ user 看「系統異常、請重新提交」、admin panel 看 `failure_reason` 全文 |

---

## 設計核心：三層失敗點（概念）

把 worker 一次處理一個 submission 的工作**概念上**拆三段：

| 階段 | 在做什麼 | 失敗例子 | 策略 |
|---|---|---|---|
| **L1** 開判前 | MinIO 拉 source、啟動 sandbox 容器 | MinIO 連不上、docker daemon 抖、image 不在 | **直接 JudgeFailed**（不 retry）|
| **L2** 判題中 | sandbox 跑 user code、收集 verdict | sandbox 跑一半被砍、docker daemon 中途斷 | **直接 JudgeFailed**（不 retry）|
| **L3** 判完 callback | 已算出 verdict、POST 給 backend | backend 5xx、network 抖 | **1 retry @1s** → 仍失敗 → log stderr + 留 Pending |

**為什麼 L3 特殊**：判題很貴（容器啟動 + 編譯 + 跑 + 比對 testcase）、callback 很便宜。為了 1 秒 backend 抖動、不該重判 30 秒。

> **注意**：code 上 L1 / L2 行為**完全一樣**（都是 try/except 兜整段、不 retry），所以實作只有一個 try/except 包整段 pre-callback、不再細分。三層拆分是文件閱讀用的心智模型、不是程式碼結構。

**核心紀律**：
- pre-callback (L1+L2) 失敗 → user 看「系統異常、請重新提交」、admin 看 `failure_reason` root cause、**user 自己重交當人肉 retry**
- callback (L3) 救援是「verdict 已經算出來、不能弄丟」、retry 完才放棄
- 「user 寫的 code 出錯」（CE / TLE / WA / RE / MLE）**不算 failure**、是有效 verdict、Step 8 已處理、不在本 step scope

---

## 合約 1：Submission status 終態擴充

### 1a. 新 status: `JudgeFailed`

`Submission.status` enum 加值。

| 現行 status | 含意 | 是不是終態 |
|---|---|---|
| `Pending` | 還沒 worker 拿到 | ❌ |
| `Judging` | worker 拿到、判題中 | ❌ |
| `AC` / `WA` / `TLE` / `MLE` / `RE` / `CE` | 跑完、verdict（user code 結果）| ✅ |
| **`JudgeFailed`**（new） | 系統錯誤、judge pipeline 失敗、需 admin 介入或 user 重交 | ✅ |

**對 idempotency UPDATE WHERE 的影響**：

```sql
-- Step 8 寫法（callback handler）不變
UPDATE submissions SET ... WHERE id=:sub_id AND status IN ('Pending', 'Judging')
```

WHERE clause 不需要動：
- 成功 verdict：Pending/Judging → AC/WA/...（whitelist OK）
- 失敗 verdict：Pending/Judging → JudgeFailed（whitelist 起點 OK）
- 重複 callback 進來時 status 已是終態（JudgeFailed / AC / ...）→ rowcount=0 silent 200

### 1b. 新欄位 `failure_reason`（nullable）

```python
class Submission(Base):
    ...
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
```

只在 `status=JudgeFailed` 時填、其他狀態 null。

內容：`repr(exception)` + `traceback.format_exc()` 完整 traceback。**不截斷**（Postgres TEXT 放得下、學生量級 trivial）。**只給 admin、不洩漏 user**。

### 1c. Migration

`backend/conftest.py` 用 `create_all`（dev workflow 規則：加 column 後 `docker compose down -v` 重建 pg_data；prod migration 由 Alembic 處理）。

---

## 合約 2：Callback API 擴充

### 2a. Payload schema

```python
class JudgeCallbackPayload(BaseModel):
    submission_id: UUID
    # Step 8 既有欄位
    exec_time_ms: int | None = None
    memory_mb: int | None = None
    judge_log: str | None = None
    per_testcase: list[TestcaseResult] | None = None
    # Step 9 新欄位
    verdict: Literal["Success", "JudgeFailed"] = "Success"
    failure_reason: str | None = None  # 只在 verdict="JudgeFailed" 時填
```

**Backwards compat**：`verdict` default = `"Success"` = step 8 既有行為、不破壞現有 worker。

**為什麼用 Literal enum 而不是「`failure_reason is not None` 判斷」**：explicit > implicit、給 Pydantic 用 discriminator、handler 邏輯一看就懂。

### 2b. Handler 邏輯

```python
if payload.verdict == "JudgeFailed":
    result = db.execute(text("""
        UPDATE submissions
           SET status = 'JudgeFailed',
               failure_reason = :reason
         WHERE id = :sub_id
           AND status IN ('Pending', 'Judging')
    """), {"sub_id": payload.submission_id, "reason": payload.failure_reason})
else:
    # Step 8 既有路徑：從 per_testcase 推 overall verdict + 算分 + UPDATE
    ...

db.commit()
if result.rowcount == 0:
    log.info(f"duplicate callback for {payload.submission_id}, no-op")
return Response(status_code=200)
```

兩條路徑共用同一個 `WHERE status IN ('Pending', 'Judging')` guard、idempotency 規則一致。

### 2c. Response code

- `200`：寫入成功 / silent no-op（重複 callback）
- `401`：`X-Worker-Secret` 不對
- `422`：payload schema 錯

---

## 合約 3：Worker 失敗路徑

### 3a. Pre-callback（L1 + L2）失敗

```python
import traceback

def process_submission(msg: dict):
    submission_id = msg["submission_id"]
    try:
        source_path = fetch_source(msg["presigned_url"])       # L1
        verdict_result = run_official(source_path, msg)        # L2
    except Exception as e:
        # pre-callback 任何錯：直接送 failure callback、不 retry 判題
        reason = f"{repr(e)}\n{traceback.format_exc()}"
        post_callback_with_retry(
            submission_id,
            payload={"verdict": "JudgeFailed", "failure_reason": reason},
        )
        ack_message(msg)
        return

    # L3：成功路徑
    post_callback_with_retry(submission_id, payload=verdict_result)
    ack_message(msg)
```

**為什麼用 `except Exception` 一網打盡、不分 class**：所有 pre-callback exception 在這層的處理完全相同（送 failure callback + ACK message）。為了區分而做 class hierarchy 是純文件裝飾、code 沒任何分支。`repr(e)` 已含 class 名 + message、`traceback.format_exc()` 給 admin debug 用。

### 3b. Callback（L3）救援：1 retry

```python
def post_callback_with_retry(submission_id, payload):
    for attempt in (1, 2):  # 共 2 次嘗試 = 初試 + 1 retry
        try:
            r = requests.post(CALLBACK_URL, json=payload,
                              headers={"X-Worker-Secret": SECRET}, timeout=5)
            if 200 <= r.status_code < 300:
                return  # 成功
            if 400 <= r.status_code < 500:
                # 4xx：backend 拒、retry 無意義、直接放棄
                logger.error(
                    f"callback rejected 4xx: submission={submission_id} "
                    f"status={r.status_code} body={r.text[:500]} payload={payload}"
                )
                return
            # 5xx → 等 1 秒 retry
        except (requests.Timeout, requests.ConnectionError) as e:
            pass  # 等 1 秒 retry
        if attempt == 1:
            time.sleep(1.0)

    # 2 次都失敗（5xx / timeout / connection error）→ log stderr 收工
    logger.error(
        f"callback failed permanently: submission={submission_id} payload={payload}"
    )
```

> **為什麼 4xx 不 retry**：4xx 表示 backend 認定此 request 永遠不該成功（譬如 `submission_id` 不存在、payload schema 不合）、retry 一樣失敗、浪費時間。

> **為什麼只 1 retry**：100 學生 + docker-compose scale、backend 抖動極罕見；1 retry @1s 拿到 95% 的價值、多 retry 邊際效用接近零。

> **⚠️ Invariant：permanent failure 仍 ACK（不是 bug）**：4xx 放棄 / 2 次 5xx 都失敗時、本函式 `return`、由 caller `process_submission` 接著呼叫 `ack_message(msg)`、message 從 queue 移除、submission row 維持 `Pending`、靠人工 reconcile（見 §3c）。**這是刻意的、不要改成 NACK / redelivery**——一旦改、callback idempotency 假設要重評。若未來上 k8s 加 message redelivery、§2b 的 `WHERE status IN ('Pending', 'Judging')` guard 才會真正承擔重複 callback 的壓力。

### 3c. Callback 永久失敗的後果

最差情境：worker 跑完 verdict、callback 試 2 次都失敗、寫 stderr 收工。後果：

- ✅ Submission row 仍是 `Pending` / `Judging`（沒被 UPDATE）
- ✅ Worker stderr 有完整 payload + error 紀錄
- ⚠️ User UI 一直轉圈（status 沒變）、需要 admin 介入：
  1. 從 `docker compose logs judge-worker`（Step 10 上 Loki 後從 Grafana）找到 stderr 紀錄
  2. 手動 `UPDATE submissions SET status=... WHERE id=...` 補 verdict
- ⚠️ 在 Step 10 (Loki) 沒上線前、container restart 會丟 stderr——學生 project scale 接受此風險

Step 10 上 Loki 後 stderr 持久化、Step 11 上 k8s 後加 message redelivery 進一步降低風險。

---

## 合約 4：前端 / Admin 呈現

### 4a. User UI

`frontend/src/components/JudgeStatusBadge.jsx` 加 `JudgeFailed` 對應：

```jsx
const STATUS_LABEL = {
  Pending: '排隊中',
  Judging: '判題中',
  AC: '通過',
  WA: '答案錯誤',
  TLE: '執行逾時',
  MLE: '記憶體超限',
  RE: '執行錯誤',
  CE: '編譯錯誤',
  JudgeFailed: '系統異常，請重新提交',  // 新
}
```

**不顯示 `failure_reason`**——user UI 看不到內部錯誤訊息、避免洩漏 sandbox / docker / MinIO 細節。

### 4b. Admin

**本 PR 只動 backend、frontend admin UI 延後**（panel stack 還沒回到 main、見「開工順序」末尾 follow-up 註）。

**Backend（本 PR）**：`GET /api/v1/admin/submissions/{id}` 回應加 `failure_reason` 欄（一般 user `GET /api/v1/submissions/{id}` 不回此欄、僅 admin role 可見）。

**Frontend（follow-up PR、不在本 PR）**：admin panel 的 Submission 詳情頁加一欄展示 `failure_reason` 全文、`<pre>` monospace 顯示、可複製。

---

## 開工順序建議

> **本 PR 範圍**：合約 docs + 9-B backend + 9-C worker/frontend、**一次 ship**。理由：senior v2 audit 已過、設計信心高；總量 ~500 行可控、不必拆 3 PR。Branch = `feat/judge-failure-handling`。

1. **9-A**（本 PR、docs）：本檔 `docs/judge-failure-handling.md`
2. **9-B**（本 PR、backend、~100 行）：
   - migration：status enum 加 `JudgeFailed`、`submissions` 加 `failure_reason TEXT NULL`
   - schema：`JudgeCallbackPayload` 加 `verdict` + `failure_reason`
   - handler：兩條路徑（JudgeFailed / Success）、idempotency guard 不變
   - admin endpoint：`GET /api/v1/admin/submissions/{id}` 加 `failure_reason` 欄
   - tests：failure callback path、JudgeFailed idempotency（重複 callback silent 200）、4xx schema reject
3. **9-C**（本 PR、worker + frontend、~150 行）：
   - worker：`post_callback_with_retry()`（1 retry）+ `process_submission()` `except Exception` 兜全
   - frontend：`JudgeStatusBadge.jsx` 加 JudgeFailed label
   - tests：注入會 raise 的 spawner → JudgeFailed；mock backend 永遠 5xx → submission 維持 Pending + stderr 有紀錄
4. **Integration test**（本 PR、在 9-C 內）：
   - poison source → backend 看到 JudgeFailed、failure_reason 可讀
   - backend 暫關 1 秒 → callback retry → backend 起來 → submission 終態正確、user 不感知
   - backend 永遠 5xx → submission 仍 Pending、worker stderr 有完整 payload 紀錄

> **Follow-up PR**（不在本 PR）：frontend admin panel SubmissionDetail 加「失敗詳情」欄展示 `failure_reason`。等 panel stack（PR #30/#32/#33 → main 整合 PR）落地後另開。

---

## 範圍外（明確 defer 到 Step 10+）

| Defer 項目 | 之後 step | 為什麼不在 Step 9 |
|---|---|---|
| Worker stderr → Loki → Grafana 視覺化 | Step 10（Shuan PR #31 logging-infra）| observability 是另一條獨立軌、跟 reliability 解耦 |
| 失敗 metric counter（Prometheus）| Step 10 | metric 跟 log 一起做、同 step |
| Cross-process retry / message redelivery / PEL claim | Step 11 上 k8s 時補 | docker compose worker 不會被 evict、不需要 |
| Admin panel「失敗紀錄列表」UI | Step 10+ | 不影響核心 reliability |
| 失敗自動 reconcile / admin batch UI | Step 10+ | 學生量級人工 SQL 補夠用 |
| RUN_ONLY 真實作 | Step 10+ | Step 8 已 reject、不阻擋核心流程 |
| Rejudge endpoint | Step 10+ | admin 功能、跟 reliability 解耦 |
| Multi-worker scaling | Step 11 上 k8s | docker compose scale 受限 host docker |
| Submission status 增加更細分類（SystemError / WorkerError）| — | `failure_reason` 字串夠表達、不增加 enum 複雜度 |
| DLQ Redis stream | — | Senior audit 認定 over-engineering at this scale；stderr + admin reconcile 足夠 |
