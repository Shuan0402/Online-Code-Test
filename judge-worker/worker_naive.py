"""
Step 6 — ANTI-PATTERN 版本（故意寫爛）。

設計缺陷：worker 主流程「直接呼叫 docker CLI」，沒抽 spawner interface。
跑 happy path 是會通的，但任何「換執行平台」的事情（K8s Job / Firecracker / gVisor）
都要回頭把整個 judge() 拆掉重寫。

這支檔案的用途是「親身踩坑」——跑通之後我們會回頭數：要遷 K8s 時 diff 散到哪幾行。
之後 worker.py（修正版）會把 docker 細節藏到 SandboxSpawner 後面。

執行方式（Step 6 階段不做 containerization，先當 local script 跑）：
    python3 judge-worker/worker_naive.py
前提：本機已有 sandbox:python image（step 5 build 過）。
"""

import subprocess
import time


# ── 假裝是從 queue 撈出來的 submission ────────────────────────────
# B 範圍（Redis queue + submission schema）之後接，現在 hardcode 驗主流程。
SUBMISSIONS = [
    {
        "id": "s1-py-ac",
        "language": "python",
        "source_code": "print(2 + 2)\n",
        "expected_output": "4\n",
        "timeout_sec": 5,
    },
    {
        "id": "s2-py-wa",
        "language": "python",
        "source_code": "print(2 + 3)\n",
        "expected_output": "4\n",
        "timeout_sec": 5,
    },
    {
        "id": "s3-py-tle",
        "language": "python",
        "source_code": "while True:\n    pass\n",
        "expected_output": "",
        "timeout_sec": 2,
    },
    {
        "id": "s4-py-re",
        "language": "python",
        "source_code": "raise ValueError('boom')\n",
        "expected_output": "",
        "timeout_sec": 5,
    },
]


def post_callback(submission_id: str, verdict: str, stdout: str, stderr: str) -> None:
    """假裝是 POST 回 backend——B 範圍的 callback API 之後接。"""
    print(f"[callback] id={submission_id} verdict={verdict}")


def _decode_output(raw) -> str:
    """Decode bytes-or-str output from a timed-out subprocess, returning '' for None."""
    if raw is None:
        return ""
    if isinstance(raw, bytes):
        return raw.decode()
    return raw


def _decide_verdict(timed_out: bool, exit_code: int, stdout: str, sub: dict) -> str:
    """Map execution results to a verdict string."""
    if timed_out:
        return "TLE"
    if exit_code == 100 and sub["language"] == "cpp":
        return "CE"
    if exit_code != 0:
        return "RE"
    if stdout != sub["expected_output"]:
        return "WA"
    return "AC"


def judge(sub: dict) -> None:
    image = f"sandbox:{sub['language']}"          # ← docker 細節 #1: image 名稱組合
    timeout = sub["timeout_sec"]

    start = time.monotonic()
    timed_out = False
    stdout = ""
    stderr = ""
    exit_code = -1

    try:
        # ── docker 細節 #2: docker CLI 字串寫死在主流程裡 ────────
        proc = subprocess.run(
            ["docker", "run", "--rm", "-i", image],
            input=sub["source_code"],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        stdout = proc.stdout
        stderr = proc.stderr
        exit_code = proc.returncode
    except subprocess.TimeoutExpired as e:
        # ── docker 細節 #3: timeout 處理寫死，且——
        # subprocess kill 了 docker CLI，但 sandbox container 可能還在 host 上跑！
        # 真正要殺 container 還得另外 docker kill <id>，這裡 anti-pattern 偷懶沒處理。
        timed_out = True
        stdout = _decode_output(e.stdout)
        stderr = _decode_output(e.stderr)

    duration = time.monotonic() - start

    # ── verdict 判定（這部分是 worker 的責任，沒問題）──────────
    verdict = _decide_verdict(timed_out, exit_code, stdout, sub)

    print(f"[judge] id={sub['id']:12s} verdict={verdict} exit={exit_code} duration={duration:.2f}s")
    if stdout:
        print(f"        stdout={stdout!r}")
    if stderr:
        print(f"        stderr={stderr!r}")

    post_callback(sub["id"], verdict, stdout, stderr)


def main() -> None:
    print("=== judge worker (naive / anti-pattern) ===")
    for sub in SUBMISSIONS:
        judge(sub)


if __name__ == "__main__":
    main()
