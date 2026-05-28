"""
Happy path 整合測試：
  1. candidate 登入
  2. 提交「兩數相加」題的正確解
  3. 輪詢 submission，等 worker 評測完
  4. 印結果，預期 AC

跑法：
    # 先在 backend container 內跑 seed.py 取得 EXAM_ID
    docker exec online-code-test-backend-1 python /app/scripts/integration/seed.py

    # 再用印出的 EXAM_ID 跑 happy path（在 backend container 內跑最穩，已有 httpx）
    docker exec -e BASE_URL=http://backend:8000 -e EXAM_ID=<uuid> \\
        online-code-test-backend-1 python /app/scripts/integration/happy_path.py
"""
import os
import sys
import time
import httpx as requests  # noqa: alias so 後面 .post/.get/.raise_for_status 全沿用

# 預設打主機外網；在 docker exec 進 backend container 內跑時用 service name
BASE_URL = os.environ.get("BASE_URL", "http://localhost:8000") + "/api/v1"

CANDIDATE_USERNAME = os.environ.get("CANDIDATE_USERNAME", "demo_candidate")
CANDIDATE_PASSWORD = os.environ.get("CANDIDATE_PASSWORD", "password123")
PROBLEM_ID = int(os.environ.get("PROBLEM_ID", "1"))
EXAM_ID = os.environ.get("EXAM_ID")
if not EXAM_ID:
    sys.exit("請先跑 seed.py 取得 EXAM_ID，然後 `export EXAM_ID=<uuid>` 再跑這支腳本")

# 正解：讀一行，拆兩個數字加起來
SOURCE_CODE = """\
a, b = map(int, input().split())
print(a + b)
"""


def login() -> str:
    print(f"[1/4] 登入 {CANDIDATE_USERNAME} ...")
    r = requests.post(
        f"{BASE_URL}/auth/login",
        data={"username": CANDIDATE_USERNAME, "password": CANDIDATE_PASSWORD},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=10,
    )
    r.raise_for_status()
    token = r.json()["access_token"]
    print(f"      ✓ 拿到 token (role={r.json()['role']})")
    return token


def submit(token: str) -> str:
    print(f"[2/4] 提交 code（problem={PROBLEM_ID}, exam={EXAM_ID}）...")
    r = requests.post(
        f"{BASE_URL}/submissions/",
        json={
            "problem_id": PROBLEM_ID,
            "exam_id": EXAM_ID,
            "language": "python",
            "source_code": SOURCE_CODE,
            "submission_type": "OFFICIAL",
        },
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )
    if r.status_code != 202:
        print(f"      ✗ 失敗 status={r.status_code} body={r.text[:300]}")
        sys.exit(1)
    sub_id = r.json()["id"]
    print(f"      ✓ submission_id = {sub_id}")
    return sub_id


def poll(token: str, sub_id: str, max_wait_sec: int = 30) -> dict:
    print(f"[3/4] 輪詢評測結果（最多等 {max_wait_sec}s）...")
    deadline = time.time() + max_wait_sec
    last_status = None
    while time.time() < deadline:
        r = requests.get(
            f"{BASE_URL}/submissions/{sub_id}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()
        status = data["status"]
        if status != last_status:
            print(f"      → status = {status}")
            last_status = status
        if status not in ("Pending", "Judging"):
            return data
        time.sleep(1)
    print(f"      ✗ 超時，最後 status = {last_status}")
    sys.exit(2)


def report(result: dict) -> None:
    print(f"[4/4] 結果：")
    print(f"      status         = {result['status']}")
    print(f"      score          = {result.get('score')}")
    print(f"      execution_time = {result.get('execution_time')} ms")
    print(f"      memory_usage   = {result.get('memory_usage')} MB")
    if result["status"] == "AC":
        print("\n      ✅ HAPPY PATH 通過")
    else:
        print(f"\n      ⚠️  非 AC，judge_log:\n{result.get('judge_log')}")
        sys.exit(3)


def main():
    print("=" * 60)
    print("Online Code Test — Happy Path 整合測試")
    print("=" * 60)
    token = login()
    sub_id = submit(token)
    result = poll(token, sub_id)
    report(result)


if __name__ == "__main__":
    main()
