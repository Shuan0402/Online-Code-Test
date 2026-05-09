"""
Judge Worker 主流程。

Step 6: 抽出 SandboxSpawner 介面、判 verdict 從 docker 細節解耦
Step 7: verdict 加 MLE 分支；judge() 收 SpawnerError 跟 user code 錯誤分開

跟 anti-pattern (worker_naive.py) 的差別：
- judge() 函式裡找不到任何 docker / subprocess 字眼
- 唯一跟具體實作耦合的是 main() 裡的 `spawner = DockerSpawner()` 那行
- K8s 遷移時換成 `spawner = K8sJobSpawner()`，judge() 0 改動

Step 8 才把 SUBMISSIONS / post_callback 換成 Redis queue + HTTP callback (B 範圍)。
"""

from spawner.base import CompletedRun, SandboxSpawner, SpawnerError
from spawner.docker_spawner import DockerSpawner


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
    """Step 8 才接真的 callback API（B 範圍），現在 print 出來看就好。"""
    print(f"[callback] id={submission_id} verdict={verdict}")


def decide_verdict(result: CompletedRun, sub: dict) -> str:
    # 順序很重要：OOM 比 TLE 優先，因為 OOM kill 會同時觸發 timeout（race），
    # 但 root cause 是 memory，要正確歸因到 MLE。
    if result.oom_killed:
        return "MLE"
    if result.timed_out:
        return "TLE"
    # C++ entrypoint.sh 會讓 g++ 失敗時 exit 100，當作 CE 的 sentinel
    if result.exit_code == 100 and sub["language"] == "cpp":
        return "CE"
    if result.exit_code != 0:
        return "RE"
    if result.stdout != sub["expected_output"]:
        return "WA"
    return "AC"


def judge(spawner: SandboxSpawner, sub: dict) -> None:
    image = f"sandbox:{sub['language']}"
    try:
        result = spawner.run(
            image=image,
            stdin=sub["source_code"],
            timeout=sub["timeout_sec"],
        )
    except SpawnerError as e:
        # 系統錯誤（image 不存在、daemon 不通...）：不寫 verdict、不 callback
        # 之後 queue redelivery 會讓另一個 worker 重試（Step 8）
        print(f"[judge] id={sub['id']:12s} SYSTEM_ERROR: {e}")
        return

    verdict = decide_verdict(result, sub)

    print(
        f"[judge] id={sub['id']:12s} verdict={verdict} "
        f"exit={result.exit_code} duration={result.duration_sec:.2f}s"
    )
    if result.stdout:
        suffix = " [truncated]" if result.truncated_stdout else ""
        print(f"        stdout={result.stdout!r}{suffix}")
    if result.stderr:
        suffix = " [truncated]" if result.truncated_stderr else ""
        print(f"        stderr={result.stderr!r}{suffix}")

    post_callback(sub["id"], verdict, result.stdout, result.stderr)


def main() -> None:
    print("=== judge worker (spawner-injected) ===")
    spawner: SandboxSpawner = DockerSpawner()
    # 換 K8s 時這行改成： spawner = K8sJobSpawner()
    # judge() 內部完全不需要動。
    for sub in SUBMISSIONS:
        judge(spawner, sub)


if __name__ == "__main__":
    main()
