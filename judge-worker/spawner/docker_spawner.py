"""DockerSpawner——SandboxSpawner 的 docker 版實作。

Step 6 → Step 7 的演進：
  Step 6：抽出介面、修掉 orphan container bug（subprocess timeout 後主動 docker kill）
  Step 7：加全套 runtime 安全旗標、orphan 治理、output cap、bytes 解碼、OOMKilled 偵測

關鍵設計：
  - 所有 docker CLI 細節藏在這個檔案，worker 主流程只看 SandboxSpawner ABC
  - 新增執行平台（K8s / Firecracker）= 新寫一個 SandboxSpawner 子類，worker 0 改動

執行流程（一次 run() 內部）：
  1. 確認 image 存在（lazy + cache）→ 不存在 raise SpawnerError
  2. 起 container：subprocess.run docker run（不加 --rm，留著 inspect）
  3. 過程中 user code 透過 stdin 進入、stdout/stderr 出來
  4. timeout / 跑完 → docker inspect 拿 OOMKilled + ExitCode
  5. docker rm -f 清掉 container

Orphan 治理：
  - 每隻 sandbox 起來時打 label app=judge-sandbox
  - DockerSpawner.__init__() 啟動時掃這個 label 的所有 container 全殺
    （清前任 worker 留下的 orphan；單 worker 場景簡單有效）
  - 多 worker 情境下會誤殺別人的 sandbox——Step 8 接 queue 時改用 worker_id label
"""

from __future__ import annotations  # 讓 type hint（int | None 等）支援 Python 3.9

import subprocess
import time
import uuid

from .base import CompletedRun, SandboxSpawner, SpawnerError


# stdout / stderr 各自上限。超過截斷 + 設 truncated 旗標。
# 64 KB 對 OJ 來說足以容納合理輸出（一般題目最多印幾百行）。
MAX_OUTPUT_BYTES = 64 * 1024


class DockerSpawner(SandboxSpawner):
    def __init__(self) -> None:
        self._verified_images: set[str] = set()
        self._sweep_orphan_sandboxes()

    # ── public API ─────────────────────────────────────────────

    def run(self, image: str, stdin: str, timeout: int) -> CompletedRun:
        self._ensure_image(image)

        container_name = f"sandbox-{uuid.uuid4().hex[:12]}"
        cmd = self._build_run_cmd(image, container_name)

        start = time.monotonic()
        timed_out = False
        stdout_raw = b""
        stderr_raw = b""

        try:
            proc = subprocess.run(
                cmd,
                input=stdin.encode("utf-8"),  # bytes 不 text=True，避免 non-UTF8 source 炸
                capture_output=True,
                timeout=timeout,
            )
            stdout_raw = proc.stdout
            stderr_raw = proc.stderr
        except subprocess.TimeoutExpired as e:
            self._kill_container(container_name)
            timed_out = True
            stdout_raw = e.stdout or b""
            stderr_raw = e.stderr or b""

        duration = time.monotonic() - start

        # 從 docker inspect 拿 OOMKilled + 真實 exit code
        # 這比 subprocess.returncode 精確：subprocess 看到的是 docker CLI 的 exit code，
        # 不一定等於 container 內 process 的 exit code（例如 docker kill 強砍時）
        oom_killed, inspected_exit = self._inspect_state(container_name)
        self._remove_container(container_name)

        # 用 inspect 拿到的為主，沒拿到時 fallback 到 subprocess returncode
        if inspected_exit is not None:
            exit_code = inspected_exit
        elif timed_out:
            exit_code = -1
        else:
            exit_code = proc.returncode  # type: ignore[possibly-undefined]

        stdout, truncated_stdout = self._cap_and_decode(stdout_raw)
        stderr, truncated_stderr = self._cap_and_decode(stderr_raw)

        return CompletedRun(
            stdout=stdout,
            stderr=stderr,
            exit_code=exit_code,
            duration_sec=duration,
            timed_out=timed_out,
            oom_killed=oom_killed,
            truncated_stdout=truncated_stdout,
            truncated_stderr=truncated_stderr,
        )

    # ── internal helpers ───────────────────────────────────────

    def _build_run_cmd(self, image: str, container_name: str) -> list[str]:
        """組 docker run 指令。所有安全旗標的單一來源。

        改安全旗標只動這一個函式，worker 主流程 / verdict / 介面通通不動。
        """
        return [
            "docker", "run",
            "-i",                                   # stdin 從 pipe 讀
            "--name", container_name,
            "--label", "app=judge-sandbox",         # startup sweep 認這個

            # 縱深防禦：強制 nonroot uid（即使 image USER 被改掉這層仍守住）
            "--user", "65532:65532",

            # 網路：完全切斷
            "--network", "none",

            # 檔系統：rootfs read-only + 給一塊 RAM-backed 暫存區
            "--read-only",
            "--tmpfs", "/tmp:size=10m,mode=1777",

            # Linux capabilities：全砍
            "--cap-drop", "ALL",

            # 防 setuid binary 提權（即使 image 內藏 setuid root 也失效）
            "--security-opt", "no-new-privileges",

            # 資源限制（cgroup）
            "--pids-limit", "64",                   # 防 fork bomb
            "--memory", "256m",                     # RAM 上限 → OOM kill → MLE
            "--memory-swap", "256m",                # swap 不另給（同 memory = swap 0）
            "--cpus", "0.5",                        # CPU 上限

            # ulimit 補強（cgroup 有些項目沒涵蓋）
            "--ulimit", "nproc=64",                 # process 數
            "--ulimit", "nofile=128",               # 開檔數

            # 注意：不加 --rm。需要結束後 docker inspect 拿 OOMKilled。
            image,
        ]

    def _ensure_image(self, image: str) -> None:
        """確認 image 存在；首次呼叫才查、之後 cache。"""
        if image in self._verified_images:
            return
        proc = subprocess.run(
            ["docker", "image", "inspect", image],
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            raise SpawnerError(
                f"sandbox image not available locally: {image!r}. "
                f"build it first (judge-sandbox/images/{image.split(':')[1]}/)"
            )
        self._verified_images.add(image)

    def _inspect_state(self, container_name: str) -> tuple[bool, int | None]:
        """回 (oom_killed, exit_code)；inspect 失敗回 (False, None)。"""
        proc = subprocess.run(
            ["docker", "inspect", container_name,
             "--format", "{{.State.OOMKilled}} {{.State.ExitCode}}"],
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            return False, None
        parts = proc.stdout.strip().split()
        if len(parts) != 2:
            return False, None
        oom_killed = parts[0].lower() == "true"
        try:
            exit_code = int(parts[1])
        except ValueError:
            exit_code = None
        return oom_killed, exit_code

    def _remove_container(self, container_name: str) -> None:
        # capture_output 是為了不讓清理訊息污染 worker log
        subprocess.run(
            ["docker", "rm", "-f", container_name],
            capture_output=True,
            text=True,
        )

    def _kill_container(self, container_name: str) -> None:
        subprocess.run(
            ["docker", "kill", container_name],
            capture_output=True,
            text=True,
        )

    def _sweep_orphan_sandboxes(self) -> None:
        """Startup 時殺前任 worker 留下的 sandbox container。"""
        proc = subprocess.run(
            ["docker", "ps", "-q", "--filter", "label=app=judge-sandbox"],
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            return  # daemon 不通就靜默；run() 時會炸
        ids = [line.strip() for line in proc.stdout.splitlines() if line.strip()]
        if not ids:
            return
        print(f"[spawner] sweeping {len(ids)} orphan sandbox container(s) from previous worker")
        subprocess.run(
            ["docker", "rm", "-f", *ids],
            capture_output=True,
            text=True,
        )

    @staticmethod
    def _cap_and_decode(raw: bytes) -> tuple[str, bool]:
        """截斷到 MAX_OUTPUT_BYTES + UTF-8 decode（無效 byte 變 �）。"""
        truncated = len(raw) > MAX_OUTPUT_BYTES
        capped = raw[:MAX_OUTPUT_BYTES]
        return capped.decode("utf-8", errors="replace"), truncated
