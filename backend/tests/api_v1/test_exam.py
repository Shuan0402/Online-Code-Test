import uuid
from app.models.exam import Exam
from app.models.enums import ExamStatus


# --- GET /exams (考試列表查詢) ---
def test_get_candidate_exams_success(client, db_session, candidate_user, interviewer_user, override_auth):
    """
    測試考生成功獲取自己的考試清單，且清單中自動過濾掉 Draft（草稿）考卷。
    """
    override_auth(candidate_user)

    exam_published = Exam(
        id=uuid.uuid4(),
        title="正式期中考",
        creator_id=interviewer_user.id,
        candidate_id=candidate_user.id,
        status=ExamStatus.Published
    )
    exam_draft = Exam(
        id=uuid.uuid4(),
        title="未完工考卷草稿",
        creator_id=interviewer_user.id,
        candidate_id=candidate_user.id,
        status=ExamStatus.Draft
    )
    db_session.add(exam_published)
    db_session.add(exam_draft)
    db_session.commit()

    response = client.get("/api/v1/exams/")
    assert response.status_code == 200
    
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == str(exam_published.id)
    assert data[0]["title"] == "正式期中考"


def test_get_candidate_exams_isolation(client, db_session, candidate_user, create_test_user, interviewer_user, override_auth):
    """
    考生不能看到被指派給「其他考生」的考試。
    """
    other_candidate = create_test_user(username="other_student")
    other_exam = Exam(
        id=uuid.uuid4(),
        title="指派給別人的秘密考試",
        creator_id=interviewer_user.id,
        candidate_id=other_candidate.id,
        status=ExamStatus.Published
    )
    db_session.add(other_exam)
    db_session.commit()

    override_auth(candidate_user)
    response = client.get("/api/v1/exams/")
    
    assert response.status_code == 200
    assert len(response.json()) == 0


def test_get_candidate_exams_forbidden_for_interviewer(client, interviewer_user, override_auth):
    """
    面試主管或非考生角色敲此端點，應回傳 403 Forbidden。
    """
    override_auth(interviewer_user)
    response = client.get("/api/v1/exams/")
    
    assert response.status_code == 403
    assert "專供受測考生調閱" in response.json()["detail"]