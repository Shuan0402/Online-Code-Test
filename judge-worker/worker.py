"""
Judge Worker 主流程（Step 8）。

跟 Step 6 的差別：
- 不再吃 hardcoded SUBMISSIONS、改從 Redis BLMOVE pop queue
- at-least-once：BLMOVE pending → processing、callback 成功才 LREM
- Startup sweep：撈 processing 孤兒回 pending（worker 上次中途死掉留下的）
- 從 MinIO pre-signed URL 抓 source、stdin = testcase input
- callback POST backend /internal/judge-callback（X-Worker-Secret）

Exception → ACK 真值表（合約 4 對齊）：
| Exception                 | ACK (LREM) | 理由                                          |
| JSONDecodeError           | ✅         | 壞訊息留著也沒用                              |
| NotImplementedError       | ✅         | RUN_ONLY 不擋 queue（step 8 OFFICIAL only）   |
| SpawnerError              | ✅         | sandbox 壞、retry 沒用、靠監控                |
| requests.HTTPError        | ❌         | callback 失敗 → sweep 重做                    |
| Exception (unexpected)    | ✅         | 避免 poison message 堵 queue；step 9+ retry   |
"""

import json
import logging
import os
import sys
import time

import redis
import requests

from spawner.base import CompletedRun, SandboxSpawner, SpawnerError
from spawner.docker_spawner import DockerSpawner


# ── config ─────────────────────────────────────────────────────────

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:8000")
WORKER_SECRET = os.environ.get("WORKER_SECRET")          # required at runtime; tests inject
QUEUE_PENDING = os.getenv("QUEUE_PENDING", "submissions:pending")
QUEUE_PROCESSING = os.getenv("QUEUE_PROCESSING", "submissions:processing")

# 給 container 啟動 + cpp 編譯 buffer，避免合法程式被 sandbox timeout 誤判 TLE
SAFETY_MARGIN_SEC = 2

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

    for tc in testcases:
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

        if case_verdict != "AC":
            break

    return per_testcase, "\n".join(judge_log_parts), max_exec_ms


# ── callback ───────────────────────────────────────────────────────


def post_callback(
    http: requests.Session,
    sub_id: str,
    per_testcase: list,
    exec_time_ms: int,
    judge_log: str,
) -> None:
    resp = http.post(
        f"{BACKEND_URL}/internal/judge-callback",
        json={
            "submission_id": sub_id,
            "per_testcase": per_testcase,
            "exec_time_ms": exec_time_ms,
            "memory_mb": None,   # step 8 不填、step 9 sandbox 加 cgroup memory 才能填
            "judge_log": judge_log,
        },
        headers={"X-Worker-Secret": WORKER_SECRET or ""},
        timeout=10,
    )
    resp.raise_for_status()   # 4xx/5xx propagate → main loop 不 ACK


# ── submission orchestration ───────────────────────────────────────


def process_submission(
    spawner: SandboxSpawner,
    http: requests.Session,
    msg: dict,
) -> None:
    sub_id = msg["submission_id"]
    if msg["submission_type"] != "OFFICIAL":
        raise NotImplementedError(
            f"submission_type={msg['submission_type']!r} not supported in step 8"
        )

    source = fetch_source(http, msg["presigned_url"])
    per_testcase, judge_log, max_exec_ms = run_official(
        spawner=spawner,
        source=source,
        language=msg["language"],
        testcases=msg["testcases"],
        time_limit_ms=msg["time_limit_ms"],
    )
    post_callback(http, sub_id, per_testcase, max_exec_ms, judge_log)


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
    """處理一筆 message。Returns True if ACK'd (LREM), False if NACK left in processing.

    分離出來給 unit test 跑單筆、不用無窮迴圈。
    """
    raw = r.blmove(QUEUE_PENDING, QUEUE_PROCESSING, timeout=0, src="LEFT", dest="RIGHT")
    msg = None
    sub_id = "?"
    try:
        msg = json.loads(raw)
        sub_id = msg.get("submission_id", "?")
        process_submission(spawner, http, msg)
    except json.JSONDecodeError:
        log.error(f"bad payload, ACK to clear: {raw!r}")
    except NotImplementedError as e:
        log.warning(f"sub={sub_id}: {e}, ACK (step 8 OFFICIAL only)")
    except SpawnerError as e:
        log.error(f"sub={sub_id}: spawner fail: {e}, ACK")
    except requests.HTTPError as e:
        log.error(f"sub={sub_id}: callback fail: {e}, NOT ACK (sweep retry)")
        return False
    except Exception as e:
        log.exception(f"sub={sub_id}: unexpected: {e}, ACK")

    r.lrem(QUEUE_PROCESSING, 1, raw)
    return True


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        stream=sys.stdout,
    )
    if not WORKER_SECRET:
        log.error("WORKER_SECRET env var not set, exiting")
        sys.exit(1)

    r = redis.from_url(REDIS_URL, decode_responses=False)
    http = requests.Session()
    spawner = DockerSpawner()

    log.info(f"worker starting; redis={REDIS_URL} backend={BACKEND_URL}")
    swept = startup_sweep(r)
    log.info(f"startup sweep moved {swept} orphans back to pending")

    log.info(f"entering main loop (BLMOVE {QUEUE_PENDING} → {QUEUE_PROCESSING})")
    while True:
        consume_once(r, spawner, http)


if __name__ == "__main__":
    main()
