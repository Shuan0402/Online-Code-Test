"""
Judge Worker 主流程（Step 6 修正版）。

跟 anti-pattern (worker_naive.py) 的差別：
- judge() 函式裡找不到任何 docker / subprocess 字眼
- 唯一跟具體實作耦合的是 main() 裡的 `spawner = DockerSpawner()` 那行
- K8s 遷移時換成 `spawner = K8sJobSpawner()`，judge() 0 改動

Step 6 還沒接 Redis queue / callback HTTP——SUBMISSIONS 跟 post_callback 還是 stub，
跟 anti-pattern 同款，方便對比。Step 8 才把這兩個串回 backend。
"""

from spawner.base import CompletedRun, SandboxSpawner
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
    result = spawner.run(
        image=image,
        stdin=sub["source_code"],
        timeout=sub["timeout_sec"],
    )
    verdict = decide_verdict(result, sub)

    print(
        f"[judge] id={sub['id']:12s} verdict={verdict} "
        f"exit={result.exit_code} duration={result.duration_sec:.2f}s"
    )
    if result.stdout:
        print(f"        stdout={result.stdout!r}")
    if result.stderr:
        print(f"        stderr={result.stderr!r}")

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
