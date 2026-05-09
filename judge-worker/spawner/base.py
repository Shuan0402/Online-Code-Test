"""
SandboxSpawner 介面層。

worker 主流程只跟這個檔案的 ABC 對話，永遠不知道下面是 docker / k8s / firecracker。
新增執行平台 = 新寫一個 SandboxSpawner 子類，worker 主流程零改動。
"""

from __future__ import annotations  # type hint 跨 Python 3.9+ 相容

from abc import ABC, abstractmethod
from dataclasses import dataclass


class SpawnerError(Exception):
    """平台/系統層級錯誤（非 user code 問題）。

    用途：把「user code 跑出來的 verdict」（CompletedRun）跟
    「sandbox 根本起不來」（SpawnerError）分開。

    例：
      - image 不存在 / pull 失敗
      - docker daemon 不通
      - k8s API server 不可達
      - cgroup 設定異常

    worker 收到 SpawnerError → 不寫 verdict / 不 callback；
    queue redelivery 機制會讓另一個 worker 重試。
    """


@dataclass(frozen=True)
class CompletedRun:
    """sandbox 執行完一次的「結果資料」——不含任何資源控制物件。

    每個欄位都是 raw signal、跟 verdict 邏輯無關；
    verdict 由 worker 根據這些欄位 + submission expected_output 判定。

    刻意不放的欄位：
    - container_id / pod_name 這類「實作層 ID」——藏在 spawner 內部，
      避免 worker 感知到下面是 docker 還是 k8s。
    - peak_memory_mb——Step 9 加 Prometheus + cAdvisor 時做，
      monitoring 不是 worker 的責任。
    """

    stdout: str
    stderr: str
    exit_code: int
    duration_sec: float
    timed_out: bool
    oom_killed: bool         # Step 7：cgroup memory limit 觸發 OOM kill；用來判 MLE
    truncated_stdout: bool   # Step 7：stdout 超過上限被截斷（防 user 印 1 GB 撐爆 worker）
    truncated_stderr: bool


class SandboxSpawner(ABC):
    """執行平台的抽象介面。

    合約：
      - 阻塞，直到「跑完 / TLE / OOM / 容器死」其中一個發生
      - 一次性回 CompletedRun（資料），不回 container 控制物件
      - 內部要負責清理（避免 orphan container / orphan k8s Job）
      - timeout 視為「預期內結果」（CompletedRun.timed_out=True），不 raise
      - OOM 視為「預期內結果」（CompletedRun.oom_killed=True），不 raise
      - 平台真的壞掉（daemon 死、image 不存在、API 不通）才 raise SpawnerError
    """

    @abstractmethod
    def run(self, image: str, stdin: str, timeout: int) -> CompletedRun:
        """跑一次 sandbox。

        Args:
            image: sandbox image 名稱（例：'sandbox:python', 'sandbox:cpp'）
            stdin: user source code（會被 ENTRYPOINT 從 stdin 讀進去執行）
            timeout: 執行時間上限（秒）；超過視為 TLE

        Returns:
            CompletedRun

        Raises:
            SpawnerError: 平台/系統層級錯誤（image 不存在、daemon 不通等）
        """
        ...
