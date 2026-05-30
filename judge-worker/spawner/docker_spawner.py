"""
DockerSpawner——SandboxSpawner 的 docker 版實作。

跟 anti-pattern (worker_naive.py) 的關鍵差異：
1. 用 `docker run --name <uuid>` 預先綁定 container 名稱，timeout 後叫得出名字
2. subprocess.TimeoutExpired 觸發時，主動 `docker kill <name>` 清掉 orphan
3. 所有 docker 細節（CLI 字串、cidfile、kill 邏輯）都藏在這個檔案裡，
   worker 主流程只跟 SandboxSpawner ABC 對話

Step 8 sandbox protocol 變動：
- source code 寫到 host tempdir、bind mount 到 /sandbox:ro
- stdin 純粹是 testcase input、餵 process stdin
- 跑完 finally 清 tempdir

Sandbox runtime safety（Questioner Advanced Story Q-2.1 / Q-2.2）：
_build_run_cmd() 帶上 cgroup + network + cap-drop + pid limit + read-only flags：
  --network=none           外連阻斷（Q-2.2）
  --memory / --memory-swap cgroup 記憶體上限（Q-2.1）；
                           動態接 problem.memory_limit_mb，無值時 fallback 256MB
  --cpus                   CPU 算力上限（Q-2.1）
  --pids-limit             防 fork 炸彈
  --cap-drop=ALL           丟掉所有 Linux capabilities
  --read-only              rootfs 唯讀
  --tmpfs /tmp:rw,exec     cpp a.out 需要 exec /tmp、所以 /tmp 開 tmpfs rw+exec
注意：/sandbox 是 readonly bind mount、不能再 tmpfs；不要把 /tmp 重複寫成 ro。
"""

import os
import shutil
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

from .base import CompletedRun, SandboxSpawner


DEFAULT_MEMORY_LIMIT_MB = 256  # fallback when caller doesn't pass per-problem limit
DEFAULT_CPU_LIMIT = "1.0"
DEFAULT_PIDS_LIMIT = "64"
DEFAULT_TMP_TMPFS_SIZE = "64m"


class DockerSpawner(SandboxSpawner):
    def run(
        self,
        image: str,
        source: str,
        source_filename: str,
        stdin: str,
        timeout: int,
        memory_limit_mb: int | None = None,
    ) -> CompletedRun:
        # DooD path 一致性：tempdir 必須建在 host 跟 worker 共掛的同名路徑下，
        # docker daemon spawn sibling container 時才能用同一個 host path mount 進去。
        # 對應 docker-compose worker 的 /tmp/oct-sandbox-work bind mount。
        sandbox_root = "/tmp/oct-sandbox-work"
        sandbox_path = Path(sandbox_root)
        sandbox_path.mkdir(parents=True, exist_ok=True)
        try:
            sandbox_path.chmod(0o755)
        except Exception:
            pass
        host_dir = Path(tempfile.mkdtemp(prefix="sandbox-", dir=sandbox_root))
        try:
            # sandbox image 跑 user 65532 + --cap-drop=ALL（沒 CAP_DAC_READ_SEARCH），
            # 所以 host_dir 一定要 world-readable+executable、source 檔要 world-readable，
            # 否則 entrypoint 連 /sandbox/source.py 都讀不到 → exit 2 RE。
            host_dir.chmod(0o755)
            source_path = host_dir / source_filename
            source_path.write_text(source)
            source_path.chmod(0o644)

            container_name = f"sandbox-{uuid.uuid4().hex[:12]}"
            cmd = self._build_run_cmd(
                image,
                container_name,
                host_dir,
                memory_limit_mb=max(memory_limit_mb or DEFAULT_MEMORY_LIMIT_MB, 6),
            )

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
        finally:
            shutil.rmtree(host_dir, ignore_errors=True)

    def _build_run_cmd(
        self,
        image: str,
        container_name: str,
        host_dir: Path,
        memory_limit_mb: int,
    ) -> list[str]:
        # Sandbox safety flags — 同步 Questioner spec Story 2 AC1 / AC2。
        # /sandbox 已是 readonly bind mount、不要在這裡 --tmpfs /sandbox。
        # cpp a.out 寫 /tmp、所以 /tmp 開 tmpfs rw + exec。
        return [
            "docker", "run", "--rm", "-i",
            "--name", container_name,
            "--network", "none",                                      # Q-2.2 阻斷外連
            "--memory", f"{memory_limit_mb}m",                        # Q-2.1 RAM 上限
            "--memory-swap", f"{memory_limit_mb}m",                   # swap 同 memory → swap=0
            "--cpus", DEFAULT_CPU_LIMIT,                              # Q-2.1 CPU 上限
            "--pids-limit", DEFAULT_PIDS_LIMIT,                       # 防 fork 炸彈
            "--cap-drop", "ALL",                                      # 丟掉所有 capabilities
            "--read-only",                                            # rootfs 唯讀
            "--tmpfs", f"/tmp:rw,exec,size={DEFAULT_TMP_TMPFS_SIZE}",  # cpp a.out 需要 exec
            "-v", f"{host_dir}:/sandbox:ro",
            image,
        ]

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
