"""
手動測試用：建立一支完整題目 + 一個全新考生帳號，方便從零跑遍 4 個角色流程。

冪等：重跑不會重複建立。

跑法：
    docker compose exec backend python -m app.scripts.seed_manual_test
"""
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, "/app")

from app.core.security import SecurityManager
from app.db.session import SessionLocal
from app.models.enums import DifficultyLevel, ExamStatus, UserRole
from app.models.exam import Exam, ExamProblem
from app.models.problem import Problem
from app.models.testcase import TestCase
from app.models.user import User


# ── 帳號設定 ─────────────────────────────────────────────────────────────────
MANUAL_QUESTIONER = "manual_q"          # 出題者（手動測試用）
MANUAL_CANDIDATE = "manual_test"        # 考生（手動測試用）
MANUAL_INTERVIEWER = "interviewer@nthu.edu.tw"  # 用既有 interviewer 當 creator
DEFAULT_PASSWORD = "password123"

PROBLEM_TITLE = "K 大數之和 (manual test)"
EXAM_TITLE = "Manual Test 場"

# ── 題目描述（純 markdown，含 headings / list / inline code / KaTeX 公式） ──
DESCRIPTION = r"""# K 大數之和

給定 **N** 個整數與一個整數 **K**，請輸出這 N 個整數中**前 K 大**的整數總和。

## 輸入格式
- 第 1 行：兩個以空白分隔的整數 N 與 K
- 第 2 行：N 個以空白分隔的整數 $a_i$

## 輸出格式
- 一行整數：前 K 大數字的總和

## 限制
- $1 \le K \le N \le 1000$
- $-10^6 \le a_i \le 10^6$

## 範例 1

輸入：

```
3 2
1 2 3
```

輸出：

```
5
```

說明：最大兩個是 2 和 3，總和 5。

## 範例 2

輸入：

```
5 1
10 -5 20 -10 15
```

輸出：

```
20
```

說明：只取最大者，是 20。

## 提示
- Python 可用 sorted(arr, reverse=True)[:K] 取前 K 大
- 邊界：考慮 N == K、含**負數**、含 **0**

## 公式
若我們把陣列由大到小排序記為 $a_{(1)} \ge a_{(2)} \ge \dots \ge a_{(N)}$，答案就是

$$ S = \sum_{i=1}^{K} a_{(i)} $$
"""

# ── Testcases：6 筆，2 sample（可見）+ 4 hidden、每筆 score_weight=10、總分 60 ──
TESTCASES = [
    # (input, expected, is_sample, score_weight, 描述)
    ("3 2\n1 2 3\n",                     "5\n",        True,  10, "範例 1"),
    ("5 1\n10 -5 20 -10 15\n",           "20\n",       True,  10, "範例 2"),
    ("1 1\n42\n",                        "42\n",       False, 10, "hidden: N=K=1 邊界"),
    ("4 2\n-1 -2 -3 -4\n",               "-3\n",       False, 10, "hidden: 全負數"),
    ("5 5\n1 2 3 4 5\n",                 "15\n",       False, 10, "hidden: N==K 全選"),
    ("6 3\n100 -100 50 -50 25 -25\n",    "175\n",      False, 10, "hidden: 正負混合"),
]


def get_or_create_user(db, username, role):
    u = db.query(User).filter(User.username == username).first()
    if u:
        return u, "skip"
    u = User(
        username=username,
        full_name=username,
        password_hash=SecurityManager.hash_password(DEFAULT_PASSWORD),
        role=role,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u, "create"


def get_or_create_problem(db, creator_id):
    p = db.query(Problem).filter(Problem.title == PROBLEM_TITLE).first()
    if p:
        return p, "skip"
    p = Problem(
        creator_id=creator_id,
        title=PROBLEM_TITLE,
        description=DESCRIPTION,
        difficulty=DifficultyLevel.Easy,
        time_limit_ms=1000,
        memory_limit_mb=128,
    )
    db.add(p)
    db.commit()
    db.refresh(p)

    for input_data, expected, is_sample, weight, _label in TESTCASES:
        db.add(TestCase(
            problem_id=p.id,
            input_data=input_data,
            expected_output=expected,
            is_sample=is_sample,
            score_weight=weight,
        ))
    db.commit()
    return p, "create"


def get_or_create_exam(db, creator_id, candidate_id, problem_id):
    """建一場 Ongoing 考試、duration 120 分鐘、配 K 大數之和。冪等：已存在就重置成 Ongoing。"""
    e = db.query(Exam).filter(
        Exam.title == EXAM_TITLE,
        Exam.candidate_id == candidate_id,
    ).first()
    now = datetime.now(timezone.utc)
    if e:
        if e.status != ExamStatus.Ongoing:
            e.status = ExamStatus.Ongoing
            e.start_time = now
            e.end_time = now + timedelta(hours=2)
            db.commit()
        # 確保有 1 題、否則補上 ExamProblem
        if not e.exam_problems:
            db.add(ExamProblem(exam_id=e.id, problem_id=problem_id, sequence=1, points=100))
            db.commit()
        return e, "skip"
    e = Exam(
        title=EXAM_TITLE,
        creator_id=creator_id,
        candidate_id=candidate_id,
        duration_minutes=120,
        start_time=now,
        end_time=now + timedelta(hours=2),
        status=ExamStatus.Ongoing,
        easy_count=1, medium_count=0, hard_count=0,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    db.add(ExamProblem(exam_id=e.id, problem_id=problem_id, sequence=1, points=100))
    db.commit()
    return e, "create"


def main():
    print("=" * 70)
    print("Manual Test Seed — K 大數之和 + Manual Test 場")
    print("=" * 70)

    db = SessionLocal()
    try:
        q, q_act = get_or_create_user(db, MANUAL_QUESTIONER, UserRole.Questioner)
        c, c_act = get_or_create_user(db, MANUAL_CANDIDATE, UserRole.Candidate)
        # interviewer 用既有的（init_db / 前面手動建的）；找不到就建一個
        iv = db.query(User).filter(User.username == MANUAL_INTERVIEWER).first()
        if iv is None:
            iv, _ = get_or_create_user(db, MANUAL_INTERVIEWER, UserRole.Interviewer)
        p, p_act = get_or_create_problem(db, q.id)
        e, e_act = get_or_create_exam(db, iv.id, c.id, p.id)

        print(f"[{q_act}] questioner  = {q.username!r}  id={q.id}")
        print(f"[{c_act}] candidate   = {c.username!r}  id={c.id}")
        print(f"[{p_act}] problem     = {p.title!r}  id={p.id}  testcases={len(TESTCASES)}")
        print(f"[{e_act}] exam        = {e.title!r}  id={e.id}  status={e.status.value}")
        print()
        print("資料就緒。請依下方手動測試 flow 操作。")
        print(f"  - candidate 登入：{MANUAL_CANDIDATE} / {DEFAULT_PASSWORD}")
        print(f"  - questioner 登入：{MANUAL_QUESTIONER} / {DEFAULT_PASSWORD}")
        print(f"  - interviewer 登入：interviewer@nthu.edu.tw / {DEFAULT_PASSWORD}")
        print(f"  - admin 登入：admin@nthu.edu.tw / {DEFAULT_PASSWORD}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
