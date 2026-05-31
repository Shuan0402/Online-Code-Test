"""
pytest 從 judge-worker/ 跑時、把 judge-worker/ 加進 sys.path，
這樣 tests 可以 `from spawner.docker_spawner import DockerSpawner`。

WORKER_SECRET setdefault 也放這、conftest.py 在任何 test module load 前被 pytest
匯入、確保 worker.py module-level `WORKER_SECRET = os.environ.get(...)` 那行
拿得到值。在 test 檔內 setdefault 太晚（pytest collection 時 import_module
順序可能讓 worker 比 setdefault 先 load）。

Run:
    cd judge-worker
    pytest
"""

import os
import sys
from pathlib import Path

os.environ["WORKER_SECRET"] = "test-secret"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
