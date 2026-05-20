# backend/tests/services/test_exam_service.py

import pytest
import uuid
from datetime import datetime, timezone, timedelta
from app.models.submission import Submission
from app.models.exam import Exam
from app.models.enums import ExamStatus, JudgeStatus
from app.services.exam import exam_service


def test_refresh_total_score_takes_latest_instead_of_max(db_session, interviewer_user, candidate_user, create_test_exam, create_test_problem):
    """
    最新繳交覆蓋最高分
    - 考生針對同一道題目提交兩次：
      1. 第一次拿到 AC 100 分
      2. 第二次拿到 WA 20 分
    - 驗證：考場總分必須依據「最後一次」的 20 分結算。
    """
    exam = create_test_exam(candidate_id=candidate_user.id, status=ExamStatus.Ongoing, easy_count=1)
    prob = create_test_problem()

    base_time = datetime.now(timezone.utc)

    sub_first_high = Submission(
        id=uuid.uuid4(),
        user_id=candidate_user.id,
        problem_id=prob.id,
        exam_id=exam.id,
        language="python",
        code_s3_url="s3://dummy/path1.py",
        status=JudgeStatus.AC,
        score=100,
        created_at=base_time - timedelta(minutes=5)
    )
    sub_second_latest = Submission(
        id=uuid.uuid4(),
        user_id=candidate_user.id,
        problem_id=prob.id,
        exam_id=exam.id,
        language="python",
        code_s3_url="s3://dummy/path2.py",
        status=JudgeStatus.WA,
        score=20,
        created_at=base_time
    )
    db_session.add_all([sub_first_high, sub_second_latest])
    db_session.commit()

    final_score = exam_service.refresh_total_score(db_session, str(exam.id))

    assert final_score == 20
    db_session.refresh(exam)
    assert exam.score == 20


def test_refresh_total_score_multiple_problems_accumulation(db_session, candidate_user, create_test_exam, create_test_problem):
    """
    多題多繳交：跨題目最新分數加總
    - 考場內有兩道題目 (Problem A, Problem B)：
      - Problem A 提交兩次：最新一筆為 40 分。
      - Problem B 提交一次：最新一筆為 50 分。
    - 驗證：總分應為 40 + 50 = 90 分。
    """
    exam = create_test_exam(candidate_id=candidate_user.id, status=ExamStatus.Ongoing, easy_count=2)
    prob_a = create_test_problem(title="Problem A")
    prob_b = create_test_problem(title="Problem B")

    base_time = datetime.now(timezone.utc)

    sub_a1 = Submission(
        id=uuid.uuid4(), user_id=candidate_user.id, problem_id=prob_a.id, exam_id=exam.id, 
        language="python", code_s3_url="s3://dummy/path3.py", status=JudgeStatus.AC, score=100, 
        created_at=base_time - timedelta(minutes=10)
    )
    sub_a2 = Submission(
        id=uuid.uuid4(), user_id=candidate_user.id, problem_id=prob_a.id, exam_id=exam.id, 
        language="python", code_s3_url="s3://dummy/path4.py", status=JudgeStatus.WA, score=40, 
        created_at=base_time - timedelta(minutes=2)
    )

    sub_b1 = Submission(
        id=uuid.uuid4(), user_id=candidate_user.id, problem_id=prob_b.id, exam_id=exam.id, 
        language="python", code_s3_url="s3://dummy/path5.py", status=JudgeStatus.AC, score=50, 
        created_at=base_time - timedelta(minutes=1)
    )

    db_session.add_all([sub_a1, sub_a2, sub_b1])
    db_session.commit()

    final_score = exam_service.refresh_total_score(db_session, str(exam.id))

    assert final_score == 90


def test_refresh_total_score_empty_submission(db_session, candidate_user, create_test_exam):
    """
    無任何繳交紀錄的空白考卷
    - 驗證當一場考試才剛建立，考生一題都還沒寫時，系統呼叫更新總分應回傳 0，且不引發異常。
    """
    exam = create_test_exam(candidate_id=candidate_user.id, status=ExamStatus.Ongoing, easy_count=1)
    
    final_score = exam_service.refresh_total_score(db_session, str(exam.id))
    
    assert final_score == 0
    db_session.refresh(exam)
    assert exam.score == 0