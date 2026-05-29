"""
Judge Worker 主流程（Step 9 / 判題失敗處理合約）。

跟 Step 8 的差別：
- 任何 L1+L2 失敗（fetch_source / SpawnerError / unexpected）→ 不再 ACK + drop、改送
  failure callback (verdict=JudgeFailed + repr(e) + 完整 traceback)、user UI 看「系統
  異常請重交」。
- L3 callback 失敗 → in-worker 1 retry @1s（Step 8 是 NOT ACK 靠 sweep 重做）；2 次都失敗
  log stderr 收工、submission 維持 Pending、admin 從 docker logs 撈來人工 reconcile
  （見 docs/judge-failure-handling.md §3c）。
- consume_once **永遠 ACK**——permanent callback failure 仍 ACK 是刻意的（doc §3b invariant）。

Exception → 行為真值表（Step 9）：
| 情境                              | 處理                                              |
| JSONDecodeError (parse 前)         | log + ACK + 不送 callback                         |
| submission_type != "OFFICIAL"      | log + ACK + 不送 callback（backend 應已 reject）   |
| L1/L2 任何 Exception              | 送 failure callback (verdict=JudgeFailed) + ACK   |
| Callback 5xx / network err (≤1次)  | retry @1s                                         |
| Callback 5xx / network (2次失敗)   | log stderr permanent failure、return + ACK         |
| Callback 4xx                       | log stderr、return + ACK（retry 無意義）            |
"""

import json
import logging
import os
import sys
import time
import traceback
from datetime import datetime, timezone

import redis
import requests

from spawner.base import CompletedRun, SandboxSpawner, SpawnerError
from spawner.docker_spawner import DockerSpawner

class WorkerJSONFormatter(logging.Formatter):
    """評測機專用結構化 JSON 格式化器"""
    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        reserved_attrs = {
            "args", "asctime", "created", "exc_info", "exc_text", "filename",
            "funcName", "levelname", "levelno", "lineno", "module", "msecs",
            "message", "msg", "name", "pathname", "process", "processName",
            "relativeCreated", "stack_info", "thread", "threadName"
        }
        for key, value in record.__dict__.items():
            if key not in reserved_attrs:
                log_data[key] = value

        return json.dumps(log_data, ensure_ascii=False)


# ── config ─────────────────────────────────────────────────────────

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:8000")
WORKER_SECRET = os.environ.get("WORKER_SECRET")          # required at runtime; tests inject
QUEUE_PENDING = os.getenv("QUEUE_PENDING", "submissions:pending")
QUEUE_PROCESSING = os.getenv("QUEUE_PROCESSING", "submissions:processing")

# 給 container 啟動 + cpp 編譯 buffer，避免合法程式被 sandbox timeout 誤判 TLE
SAFETY_MARGIN_SEC = 2

# Step 9: callback retry 設定。100 學生 scale 不做指數 backoff、1 retry @1s 就夠
CALLBACK_TIMEOUT_SEC = 5
CALLBACK_BACKOFF_SEC = 1.0

SOURCE_FILENAME_BY_LANGUAGE = {
    "python": "source.py",
    "cpp": "source.cpp",
}

log = logging.getLogger("worker")


# ── verdict ────────────────────────────────────────────────────────


def decide_case_verdict(result: CompletedRun, expected_output: str, language: str) -> str:
    """單一 testcase 的 verdict。

    CE sentinel：cpp entrypoint 編譯失敗會 exit 100。會對每個 testcase 重複觸發、
    但合約 5c fail-fast、第一筆 CE 就 break、所以實務上只跳一次。
    """
    if result.timed_out:
        return "TLE"
    if result.exit_code == 100 and language == "cpp":
        return "CE"
    if result.exit_code != 0:
        return "RE"
    if result.stdout != expected_output:
        return "WA"
    return "AC"


# ── source fetch ───────────────────────────────────────────────────


def fetch_source(http: requests.Session, presigned_url: str) -> str:
    resp = http.get(presigned_url, timeout=10)
    resp.raise_for_status()
    return resp.text


# ── judge core ─────────────────────────────────────────────────────


def run_official(
    spawner: SandboxSpawner,
    source: str,
    language: str,
    testcases: list,
    time_limit_ms: int,
    submission_id: str,
) -> tuple[list, str, int]:
    """跑 OFFICIAL submission 的所有 testcases、fail-fast。

    Returns:
        (per_testcase, judge_log, max_exec_ms)
        per_testcase: list[{"testcase_id", "case_verdict", "exec_time_ms"}]
                      fail-fast 後只含跑過的 testcases（含 fail 那筆）
        judge_log:    所有 testcase 的 stderr 串起來（"[tc <id>] <stderr>"）
        max_exec_ms:  跑過的 testcase 中最慢的 exec_time_ms（給合約 3 的 exec_time_ms）
    """
    image = f"sandbox:{language}"
    source_filename = SOURCE_FILENAME_BY_LANGUAGE[language]
    timeout_sec = time_limit_ms / 1000.0 + SAFETY_MARGIN_SEC

    per_testcase = []
    judge_log_parts = []
    max_exec_ms = 0

    log.info(
        f"評測機開始執行判題 | SubmissionID: {submission_id}, Lang: {language}, Testcases: {len(testcases)}",
        extra={"submission_id": submission_id, "action": "judge_start"}
    )

    for idx, tc in enumerate(testcases, start=1):
        log.info(
            f"[TC {idx}/{len(testcases)}] 正在孵化沙盒容器執行測試... [SubmissionID: {submission_id}]",
            extra={"submission_id": submission_id, "testcase_id": tc["testcase_id"]}
        )

        result = spawner.run(
            image=image,
            source=source,
            source_filename=source_filename,
            stdin=tc["input_data"],
            timeout=timeout_sec,
        )
        case_verdict = decide_case_verdict(result, tc["expected_output"], language)
        exec_ms = int(result.duration_sec * 1000)

        per_testcase.append({
            "testcase_id": tc["testcase_id"],
            "case_verdict": case_verdict,
            "exec_time_ms": exec_ms,
        })
        max_exec_ms = max(max_exec_ms, exec_ms)
        if result.stderr:
            judge_log_parts.append(f"[tc {tc['testcase_id']}] {result.stderr.rstrip()}")

        log.info(
            f"[TC {idx}] 執行完畢 - Verdict: {case_verdict}, Duration: {exec_ms}ms [SubmissionID: {submission_id}]",
            extra={
                "submission_id": submission_id,
                "testcase_id": tc["testcase_id"],
                "case_verdict": case_verdict,
                "exec_time_ms": exec_ms,
                "exit_code": result.exit_code
            }
        )

        if case_verdict != "AC":
            log.warning(
                f"觸發 Fail-fast 機制：Testcase {tc['testcase_id']} 產生非 AC 結果 ({case_verdict})，中斷後續評測。[SubmissionID: {submission_id}]",
                extra={"submission_id": submission_id, "final_verdict": case_verdict, "action": "fail_fast_break"}
            )
            break

    return per_testcase, "\n".join(judge_log_parts), max_exec_ms


# ── callback (Step 9: 1 retry, never raise) ────────────────────────


def post_callback_with_retry(http: requests.Session, payload: dict) -> None:
    """POST /internal/judge-callback、含 1 retry @1s、永不 raise。

    結果處理：
    - 2xx：return（成功）
    - 4xx：log + return（retry 無意義、backend 永遠不會接受）
    - 5xx / Timeout / ConnectionError：等 1 秒重試一次；仍失敗 → log permanent
      failure + return（caller 仍 ACK、submission 維持 Pending、靠 admin reconcile）
    """
    sub_id = payload.get("submission_id", "?")
    url = f"{BACKEND_URL}/internal/judge-callback"
    headers = {"X-Worker-Secret": WORKER_SECRET or ""}
    last_error = None

    for attempt in (1, 2):   # 初試 + 1 retry
        try:
            resp = http.post(url, json=payload, headers=headers, timeout=CALLBACK_TIMEOUT_SEC)
            if 200 <= resp.status_code < 300:
                log.info(
                    f"callback 成功回傳 backend [SubmissionID: {sub_id}]",
                    extra={"submission_id": sub_id, "action": "callback_success", "attempt": attempt}
                )
                return  # 成功
            if 400 <= resp.status_code < 500:
                log.error(
                    f"sub={sub_id}: callback rejected 4xx, no retry; "
                    f"status={resp.status_code} body={resp.text[:500]!r}",
                    extra={
                        "submission_id": sub_id,
                        "action": "callback_4xx_rejected",
                        "status_code": resp.status_code,
                        "response_body": resp.text[:500],
                    }
                )
                return
            # 5xx → 進 retry 路徑
            last_error = f"5xx {resp.status_code}"
        except (requests.Timeout, requests.ConnectionError) as e:
            last_error = f"{type(e).__name__}: {e}"

        if attempt == 1:
            log.warning(
                f"callback 第 {attempt} 次失敗 ({last_error})、{CALLBACK_BACKOFF_SEC}s 後重試 [SubmissionID: {sub_id}]",
                extra={
                    "submission_id": sub_id,
                    "action": "callback_retry",
                    "attempt": attempt,
                    "last_error": last_error,
                }
            )
            time.sleep(CALLBACK_BACKOFF_SEC)

    # 2 次都失敗——log permanent + return（caller 仍 ACK、見 doc §3b invariant）
    log.error(
        f"sub={sub_id}: callback failed permanently after retry; "
        f"last_error={last_error}",
        extra={
            "submission_id": sub_id,
            "action": "callback_failed_permanently",
            "last_error": last_error,
            "payload": payload,
        }
    )


# ── submission orchestration ───────────────────────────────────────


def process_submission(
    spawner: SandboxSpawner,
    http: requests.Session,
    msg: dict,
) -> None:
    """跑判題 + 送 callback。**絕不 raise**——L1/L2 exception 轉成 failure callback。

    Invariant：本函式 return 後、caller (consume_once) 一律 ACK。permanent callback
    failure 仍 ACK 是刻意的（見 docs/judge-failure-handling.md §3b invariant）。
    """
    sub_id = msg["submission_id"]
    worker_extra = {
        "submission_id": str(sub_id),
        "submission_type": msg.get("submission_type"),
        "language": msg.get("language"),
    }

    log.info(
        f"成功從隊列中提取任務、開始判題 pipeline [SubmissionID: {sub_id}]",
        extra={**worker_extra, "action": "worker_process_start"}
    )

    try:
        source = fetch_source(http, msg["presigned_url"])
        per_testcase, judge_log, max_exec_ms = run_official(
            spawner=spawner,
            source=source,
            language=msg["language"],
            testcases=msg["testcases"],
            time_limit_ms=msg["time_limit_ms"],
            submission_id=sub_id,
        )
    except Exception as e:
        # L1/L2 任何錯 → failure callback（不分 exception class、senior audit 砍掉）
        # repr(e) 已含 class 名 + message；traceback.format_exc() 給 admin debug
        reason = f"{repr(e)}\n{traceback.format_exc()}"
        log.exception(
            f"pre-callback failure (L1/L2)、送 JudgeFailed callback [SubmissionID: {sub_id}]",
            extra={**worker_extra, "action": "pre_callback_failure", "error_repr": repr(e)}
        )
        post_callback_with_retry(http, {
            "submission_id": sub_id,
            "verdict": "JudgeFailed",
            "failure_reason": reason,
        })
        return

    # 成功路徑（verdict default = "Success"、backwards compat、不用顯式送）
    post_callback_with_retry(http, {
        "submission_id": sub_id,
        "per_testcase": per_testcase,
        "exec_time_ms": max_exec_ms,
        "memory_mb": None,   # cgroup memory measurement is step 10+
        "judge_log": judge_log,
    })


# ── main loop ──────────────────────────────────────────────────────


def startup_sweep(r: redis.Redis) -> int:
    """撈 processing list 的孤兒回 pending head。"""
    swept = 0
    while r.lmove(QUEUE_PROCESSING, QUEUE_PENDING, "LEFT", "LEFT"):
        swept += 1
    return swept


def consume_once(
    r: redis.Redis,
    spawner: SandboxSpawner,
    http: requests.Session,
) -> bool:
    """處理一筆 message、無論成功失敗都 ACK（LREM）。

    Returns True 永遠。Step 9：永遠 ACK——permanent callback failure 由
    post_callback_with_retry log stderr 處理、不靠 redelivery（docker-compose worker
    不會被 evict、k8s 後再加 redelivery / message claim）。
    """
    raw = r.blmove(QUEUE_PENDING, QUEUE_PROCESSING, timeout=0, src="LEFT", dest="RIGHT")

    # JSON parse 失敗 → ACK 丟掉（壞訊息留也沒用）、不送 callback
    try:
        msg = json.loads(raw)
    except json.JSONDecodeError:
        log.error(
            f"bad payload, ACK to clear: {raw!r}",
            extra={"action": "bad_payload_ack"}
        )
        r.lrem(QUEUE_PROCESSING, 1, raw)
        return True

    sub_id = msg.get("submission_id", "?")
    sub_type = msg.get("submission_type")

    # RUN_ONLY: backend `POST /submissions` 應已 reject、不該到 queue；這裡是 fallback
    # （合約 5a）。不送 failure callback——backend 已決定這 submission 不該存在判題流程
    if sub_type != "OFFICIAL":
        log.warning(
            f"sub={sub_id}: submission_type={sub_type!r} not supported, ACK without callback "
            f"(backend should reject before queue)",
            extra={
                "submission_id": sub_id,
                "submission_type": sub_type,
                "action": "unsupported_type_ack",
            }
        )
        r.lrem(QUEUE_PROCESSING, 1, raw)
        return True

    # process_submission 永不 raise、failure 內部處理成 JudgeFailed callback
    process_submission(spawner, http, msg)
    r.lrem(QUEUE_PROCESSING, 1, raw)
    return True


def main() -> None:
    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setFormatter(WorkerJSONFormatter())

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.handlers = []
    root_logger.addHandler(stdout_handler)

    file_path = os.environ.get("LOG_FILE_PATH", "/var/log/app/worker.log")
    log_dir = os.path.dirname(file_path) or "."
    try:
        os.makedirs(log_dir, exist_ok=True)
        file_handler = logging.FileHandler(file_path, encoding="utf-8")
        file_handler.setFormatter(WorkerJSONFormatter())
        root_logger.addHandler(file_handler)
    except Exception as e:
        print(f"[Logging Setup] Failed to create worker FileHandler: {e}", file=sys.stderr)

    if not WORKER_SECRET:
        log.error("WORKER_SECRET env var not set, exiting")
        sys.exit(1)

    r = redis.from_url(REDIS_URL, decode_responses=False)
    http = requests.Session()
    spawner = DockerSpawner()

    log.info(f"Worker 評測大腦正在啟動；redis={REDIS_URL} backend={BACKEND_URL}")
    swept = startup_sweep(r)
    if swept > 0:
        log.warning(
            f"偵測到上次異常關機！開機掃描（Startup Sweep）成功將 {swept} 筆孤兒任務移回 PENDING 頂部。",
            extra={"swept_count": swept, "action": "startup_sweep"}
        )
    else:
        log.info("開機掃描完成，PROCESSING 隊列清空，無孤兒任務。")

    log.info(f"進入主循環傾聽隊列 (BLMOVE {QUEUE_PENDING} → {QUEUE_PROCESSING})...")
    while True:
        consume_once(r, spawner, http)


if __name__ == "__main__":
    main()
