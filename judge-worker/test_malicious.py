"""
Step 7 故意踩坑版——驗證「沒安全旗標時 user code 能搞什麼破壞」。

使用 step 6 的 DockerSpawner（_build_run_cmd 還沒加 runtime 旗標），
跑 5 個 malicious case：
  m1-net           連外（urllib http GET example.com）
  m2-write-sandbox 在 /sandbox 寫檔（image WORKDIR、nonroot 自己擁有）
  m3-fork-bomb     bounded fork loop（內建 500 上限，避免真的弄爆 mac）
  m4-mem-bomb      allocate 300 MB（內建上限，避免吃光 mac RAM）
  m5-write-etc     寫 /etc/payload.txt（image 層 nonroot 應該能擋）

跑這支看 stdout：哪些印 SUCCESS = 攻擊得逞、哪些印 BLOCKED = 已被擋。
跑完進 step 7 修正版（加旗標）後，全部會印 BLOCKED。

執行：
    cd judge-worker && python3 test_malicious.py
"""

from spawner.base import SandboxSpawner
from spawner.docker_spawner import DockerSpawner


MALICIOUS_SUBMISSIONS = [
    {
        "id": "m1-net",
        "language": "python",
        "source_code": (
            "import urllib.request\n"
            "try:\n"
            "    r = urllib.request.urlopen('http://example.com', timeout=3)\n"
            "    print(f'NETWORK SUCCESS: status={r.status}')\n"
            "except Exception as e:\n"
            "    print(f'NETWORK BLOCKED: {type(e).__name__}: {e}')\n"
        ),
        "timeout_sec": 8,
    },
    {
        "id": "m2-write-sandbox",
        "language": "python",
        "source_code": (
            "try:\n"
            "    open('/sandbox/payload.txt', 'w').write('hacked')\n"
            "    print('WRITE /sandbox SUCCESS (rootfs writable, no --read-only)')\n"
            "except Exception as e:\n"
            "    print(f'WRITE BLOCKED: {type(e).__name__}: {e}')\n"
        ),
        "timeout_sec": 5,
    },
    {
        "id": "m3-fork-bomb",
        "language": "python",
        "source_code": (
            "import os\n"
            "MAX = 500  # bounded for mac safety, real attack would be infinite\n"
            "forked = 0\n"
            "for _ in range(MAX):\n"
            "    try:\n"
            "        pid = os.fork()\n"
            "    except OSError as e:\n"
            "        print(f'FORK BLOCKED at child #{forked}: {e}')\n"
            "        break\n"
            "    if pid == 0:\n"
            "        os._exit(0)  # child exits immediately, prevents exponential blow-up\n"
            "    forked += 1\n"
            "else:\n"
            "    print(f'FORK SUCCESS: {forked} children spawned (no --pids-limit)')\n"
        ),
        "timeout_sec": 10,
    },
    {
        "id": "m4-mem-bomb",
        "language": "python",
        "source_code": (
            "buf = []\n"
            "TARGET_MB = 300  # bounded for mac safety, real attack would be unbounded\n"
            "try:\n"
            "    for _ in range(TARGET_MB):\n"
            "        buf.append(b'x' * 1024 * 1024)\n"
            "    print(f'MEM SUCCESS: allocated {TARGET_MB} MB (no --memory limit)')\n"
            "except MemoryError as e:\n"
            "    print(f'MEM BLOCKED: {e}')\n"
        ),
        "timeout_sec": 10,
    },
    {
        "id": "m5-write-etc",
        "language": "python",
        "source_code": (
            "try:\n"
            "    open('/etc/payload.txt', 'w').write('hacked')\n"
            "    print('WRITE /etc SUCCESS — uid leak!')\n"
            "except Exception as e:\n"
            "    print(f'WRITE BLOCKED by image (nonroot): {type(e).__name__}: {e}')\n"
        ),
        "timeout_sec": 5,
    },
]


def run_one(spawner: SandboxSpawner, sub: dict) -> None:
    image = f"sandbox:{sub['language']}"
    result = spawner.run(
        image=image,
        stdin=sub["source_code"],
        timeout=sub["timeout_sec"],
    )

    print(
        f"\n[{sub['id']:18s}] duration={result.duration_sec:.2f}s "
        f"exit={result.exit_code} timed_out={result.timed_out} "
        f"oom_killed={result.oom_killed}"
    )
    if result.stdout:
        print(f"  stdout: {result.stdout.strip()}")
    if result.stderr:
        # stderr 截 200 字避免大段 traceback 淹沒畫面
        snippet = result.stderr.strip()
        if len(snippet) > 200:
            snippet = snippet[:200] + " ...(truncated)"
        print(f"  stderr: {snippet}")


def main() -> None:
    print("=" * 70)
    print("Step 7 故意踩坑版（無安全旗標、step 6 那版 DockerSpawner）")
    print("=" * 70)
    print("讀每個 case 的 stdout：")
    print("  SUCCESS = 攻擊得逞（修正版要擋掉）")
    print("  BLOCKED = 已被擋（image 層 / Python 標準限制 / 其他）")

    spawner = DockerSpawner()
    for sub in MALICIOUS_SUBMISSIONS:
        run_one(spawner, sub)

    print("\n" + "=" * 70)
    print("跑完。把 stdout 結果 paste 給 Claude，會根據結果寫修正版。")
    print("=" * 70)


if __name__ == "__main__":
    main()
