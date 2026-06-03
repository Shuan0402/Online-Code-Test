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

Step 7 sandbox 加固（已在 _build_run_cmd() 套上）：
--network=none / --memory / --cpus / --pids-limit / --cap-drop=ALL /
no-new-privileges / --read-only + tmpfs /tmp。worker 主流程不需要動。
注意：/sandbox 是 readonly bind mount、不能再 tmpfs；cpp 的 a.out 寫 /tmp、
所以 /tmp 要保留 tmpfs rw,exec。
"""

import shutil
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

from .base import CompletedRun, SandboxSpawner


class DockerSpawner(SandboxSpawner):
    def run(
        self,
        image: str,
        source: str,
        source_filename: str,
        stdin: str,
        timeout: int,
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
        host_dir.chmod(0o755)
        try:
            source_file = host_dir / source_filename
            source_file.write_text(source)
            source_file.chmod(0o644)

            container_name = f"sandbox-{uuid.uuid4().hex[:12]}"
            cmd = self._build_run_cmd(image, container_name, host_dir)

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
    ) -> list[str]:
        # Step 7 sandbox 加固（先前是 TODO、現補上）。
        # 攻擊面與對應旗標：
        #   --network=none      lateral 訪問 backend / pg / minio / redis 內網
        #   --memory / -swap    user code 吃光 worker host RAM (DoS 其他提交)
        #   --pids-limit        fork 炸彈
        #   --cpus              CPU 占用
        #   --cap-drop=ALL      預設保留的 setuid/sys_chroot 等危險 capability
        #   no-new-privileges   setuid binary 也升不了權
        #   --read-only         寫 rootfs 留 trace / 改 binary
        #   --tmpfs /tmp:rw,exec  cpp 需 /tmp 寫 a.out 並執行;size cap 防灌爆
        # 註：memory=512m 是「不爆 host 的底線」、不取代題目層 memory_limit_mb。
        # 題目層的判題用 verdict 規則（Step 10 cgroup measurement 加進來）。
        return [
            "docker", "run", "--rm", "-i",
            "--name", container_name,
            "--network=none",
            "--memory=512m",
            "--memory-swap=512m",
            "--cpus=1",
            "--pids-limit=64",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges",
            "--read-only",
            "--tmpfs", "/tmp:rw,exec,size=64m",
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
