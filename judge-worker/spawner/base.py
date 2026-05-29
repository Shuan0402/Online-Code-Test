"""
SandboxSpawner 介面層。

worker 主流程只跟這個檔案的 ABC 對話，永遠不知道下面是 docker / k8s / firecracker。
新增執行平台 = 新寫一個 SandboxSpawner 子類，worker 主流程零改動。
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass


class SpawnerError(Exception):
    """執行平台層級異常：docker daemon 死、k8s API 不通、image pull 失敗等。

    跟 CompletedRun.exit_code != 0 不同：那是 user code 跑出非零、屬於判題結果；
    SpawnerError 是平台本身壞掉、worker 應該 log + ACK + 不 retry（合約 4 #1）。

    Step 8 worker.consume_once 會 catch、ACK 訊息丟掉、靠監控 alert。
    """


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
    def run(
        self,
        image: str,
        source: str,
        source_filename: str,
        stdin: str,
        timeout: int,
        memory_limit_mb: int | None = None,
    ) -> CompletedRun:
        """跑一次 sandbox。

        Args:
            image: sandbox image 名稱（例：'sandbox:python', 'sandbox:cpp'）
            source: user 提交的 source code；spawner 負責放到容器的固定路徑 /sandbox/<filename>
            source_filename: 容器內 source 檔名（例：'source.py', 'source.cpp'）
            stdin: 餵程式 process 的 stdin —— 即 testcase input_data
            timeout: 執行時間上限（秒）；超過視為 TLE
            memory_limit_mb: cgroup 記憶體上限（MB）；None → spawner 用 default。
                對應 Questioner spec「沙箱資源限制」的 Y MB 上限。

        Returns:
            CompletedRun，含 stdout / stderr / exit_code / duration_sec / timed_out

        Note:
            Step 6 → Step 8 protocol 變動：source code 與 testcase input 分離。
            舊版 `stdin=source_code` 走 ENTRYPOINT ["python3", "-"]、testcase input 無路可走；
            新版 source 走 /sandbox readonly mount、stdin 純粹是 process stdin。
        """
        ...
