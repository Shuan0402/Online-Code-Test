"""
pytest 從 judge-worker/ 跑時、把 judge-worker/ 加進 sys.path，
這樣 tests 可以 `from spawner.docker_spawner import DockerSpawner`。

Run:
    cd judge-worker
    pytest
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
