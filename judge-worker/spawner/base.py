"""
SandboxSpawner 介面層。

worker 主流程只跟這個檔案的 ABC 對話，永遠不知道下面是 docker / k8s / firecracker。
新增執行平台 = 新寫一個 SandboxSpawner 子類，worker 主流程零改動。
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class CompletedRun:
    """sandbox 執行完一次的「結果資料」——不含任何資源控制物件。

    每個欄位都是 raw signal、跟 verdict 邏輯無關；
    verdict 由 worker 根據這些欄位 + submission expected_output 判定。

    刻意不放的欄位：
    - container_id / pod_name 這類「實作層 ID」——藏在 spawner 內部，
      避免 worker 感知到下面是 docker 還是 k8s。
    - peak_memory_mb——Step 7 加 memory limit 時再加，現在沒用上。
    """

    stdout: str
    stderr: str
    exit_code: int
    duration_sec: float
    timed_out: bool


class SandboxSpawner(ABC):
    """執行平台的抽象介面。

    合約：
      - 阻塞，直到「跑完 / TLE / 容器死」其中一個發生
      - 一次性回 CompletedRun（資料），不回 container 控制物件
      - 內部要負責清理（避免 orphan container / orphan k8s Job）
      - timeout 視為「預期內結果」（CompletedRun.timed_out=True），不 raise
      - 平台真的壞掉（daemon 死、API 不通）才 raise——這是異常事件
    """

    @abstractmethod
    def run(self, image: str, stdin: str, timeout: int) -> CompletedRun:
        """跑一次 sandbox。

        Args:
            image: sandbox image 名稱（例：'sandbox:python', 'sandbox:cpp'）
            stdin: user source code（會被 ENTRYPOINT 從 stdin 讀進去執行）
            timeout: 執行時間上限（秒）；超過視為 TLE

        Returns:
            CompletedRun，含 stdout / stderr / exit_code / duration_sec / timed_out
        """
        ...
