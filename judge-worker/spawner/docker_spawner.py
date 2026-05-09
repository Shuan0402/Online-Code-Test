"""
DockerSpawner——SandboxSpawner 的 docker 版實作。

跟 anti-pattern (worker_naive.py) 的關鍵差異：
1. 用 `docker run --name <uuid>` 預先綁定 container 名稱，timeout 後叫得出名字
2. subprocess.TimeoutExpired 觸發時，主動 `docker kill <name>` 清掉 orphan
3. 所有 docker 細節（CLI 字串、cidfile、kill 邏輯）都藏在這個檔案裡，
   worker 主流程只跟 SandboxSpawner ABC 對話

Step 7 之後會在 _build_run_cmd() 加 runtime 安全旗標
（--network=none --read-only --tmpfs --cap-drop=ALL --memory --pids-limit ...），
worker 主流程不需要動。
"""

import subprocess
import time
import uuid

from .base import CompletedRun, SandboxSpawner


class DockerSpawner(SandboxSpawner):
    def run(self, image: str, stdin: str, timeout: int) -> CompletedRun:
        container_name = f"sandbox-{uuid.uuid4().hex[:12]}"
        cmd = self._build_run_cmd(image, container_name)

        start = time.monotonic()
        try:
            proc = subprocess.run(
                cmd,
                input=stdin,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            return CompletedRun(
                stdout=proc.stdout,
                stderr=proc.stderr,
                exit_code=proc.returncode,
                duration_sec=time.monotonic() - start,
                timed_out=False,
            )
        except subprocess.TimeoutExpired as e:
            self._kill_container(container_name)
            return CompletedRun(
                stdout="",
                stderr=self._decode(e.stderr),
                exit_code=-1,
                duration_sec=time.monotonic() - start,
                timed_out=True,
            )

    def _build_run_cmd(self, image: str, container_name: str) -> list[str]:
        # Step 7 會在這裡加 --network=none / --read-only / --memory / ...
        return ["docker", "run", "--rm", "-i", "--name", container_name, image]

    def _kill_container(self, container_name: str) -> None:
        # 不檢查 returncode：container 可能已自然結束，docker kill 失敗無所謂；
        # capture_output 是為了不讓清理訊息污染 worker 的 log。
        subprocess.run(
            ["docker", "kill", container_name],
            capture_output=True,
            text=True,
        )

    @staticmethod
    def _decode(buf) -> str:
        if buf is None:
            return ""
        if isinstance(buf, bytes):
            return buf.decode(errors="replace")
        return buf
