"""
tests/test_models_init.py
驗證 app.models.__init__ 正確匯出所有模型類別與 Base，達到 100% 覆蓋率。
"""
import importlib
import inspect

import pytest

import app.models as models_module
from app.models import (
    Base,
    User,
    Problem,
    TestCase,
    Exam,
    ExamProblem,
    Submission,
    SubmissionDetail,
)
from app.models.enums import (
    UserRole,
    DifficultyLevel,
    ExamStatus,
    JudgeStatus,
    SubmissionType,
)


# ---------------------------------------------------------------------------
# 1. 確認模組可以被正確 import
# ---------------------------------------------------------------------------

class TestModelsInitImport:
    """驗證 app.models.__init__ 能成功載入且包含預期的公開符號。"""

    def test_module_is_importable(self):
        """app.models 應能成功 import，不拋出任何異常。"""
        import sys
        if "app.models" in sys.modules:
            importlib.reload(sys.modules["app.models"])
        mod = importlib.import_module("app.models")
        assert mod is not None

    def test_base_is_exported(self):
        """Base（SQLAlchemy declarative base）應從 app.models 可存取。"""
        assert Base is not None

    def test_user_is_exported(self):
        """User 類別應從 app.models 可存取。"""
        assert User is not None
        assert inspect.isclass(User)

    def test_problem_is_exported(self):
        """Problem 類別應從 app.models 可存取。"""
        assert Problem is not None
        assert inspect.isclass(Problem)

    def test_testcase_is_exported(self):
        """TestCase 類別應從 app.models 可存取。"""
        assert TestCase is not None
        assert inspect.isclass(TestCase)

    def test_exam_is_exported(self):
        """Exam 類別應從 app.models 可存取。"""
        assert Exam is not None
        assert inspect.isclass(Exam)

    def test_exam_problem_is_exported(self):
        """ExamProblem 類別應從 app.models 可存取。"""
        assert ExamProblem is not None
        assert inspect.isclass(ExamProblem)

    def test_submission_is_exported(self):
        """Submission 類別應從 app.models 可存取。"""
        assert Submission is not None
        assert inspect.isclass(Submission)

    def test_submission_detail_is_exported(self):
        """SubmissionDetail 類別應從 app.models 可存取。"""
        assert SubmissionDetail is not None
        assert inspect.isclass(SubmissionDetail)


# ---------------------------------------------------------------------------
# 2. 確認各模型是 Base 的子類別（代表 SQLAlchemy ORM 正確繼承）
# ---------------------------------------------------------------------------

class TestModelsInheritBase:
    """所有 ORM 模型均應繼承自同一個 declarative Base。"""

    @pytest.mark.parametrize("model_cls", [
        User,
        Problem,
        TestCase,
        Exam,
        ExamProblem,
        Submission,
        SubmissionDetail,
    ])
    def test_model_inherits_base(self, model_cls):
        assert issubclass(model_cls, Base), (
            f"{model_cls.__name__} 應繼承自 app.db.base.Base"
        )


# ---------------------------------------------------------------------------
# 3. 確認各模型具備正確的 __tablename__
# ---------------------------------------------------------------------------

class TestModelsTableName:
    """驗證 ORM 模型對應到正確的資料庫表格名稱。"""

    def test_user_tablename(self):
        assert User.__tablename__ == "users"

    def test_problem_tablename(self):
        assert Problem.__tablename__ == "problems"

    def test_testcase_tablename(self):
        assert TestCase.__tablename__ == "test_cases"

    def test_exam_tablename(self):
        assert Exam.__tablename__ == "exams"

    def test_exam_problem_tablename(self):
        assert ExamProblem.__tablename__ == "exam_problems"

    def test_submission_tablename(self):
        assert Submission.__tablename__ == "submissions"

    def test_submission_detail_tablename(self):
        assert SubmissionDetail.__tablename__ == "submission_details"


# ---------------------------------------------------------------------------
# 4. 確認 Enum 的值正確（smoke test for enums.py）
# ---------------------------------------------------------------------------

class TestEnumValues:
    """驗證各 Enum 的成員值符合預期。"""

    def test_user_role_values(self):
        assert UserRole.Admin == "Admin"
        assert UserRole.Candidate == "Candidate"
        assert UserRole.Interviewer == "Interviewer"
        assert UserRole.Questioner == "Questioner"

    def test_difficulty_level_values(self):
        assert DifficultyLevel.Easy == "Easy"
        assert DifficultyLevel.Medium == "Medium"
        assert DifficultyLevel.Hard == "Hard"

    def test_exam_status_values(self):
        assert ExamStatus.Draft == "Draft"
        assert ExamStatus.Published == "Published"
        assert ExamStatus.Ongoing == "Ongoing"
        assert ExamStatus.Finished == "Finished"
        assert ExamStatus.Archived == "Archived"

    def test_judge_status_values(self):
        assert JudgeStatus.Pending == "Pending"
        assert JudgeStatus.Judging == "Judging"
        assert JudgeStatus.AC == "AC"
        assert JudgeStatus.WA == "WA"
        assert JudgeStatus.TLE == "TLE"
        assert JudgeStatus.MLE == "MLE"
        assert JudgeStatus.RE == "RE"
        assert JudgeStatus.CE == "CE"
        assert JudgeStatus.JudgeFailed == "JudgeFailed"

    def test_submission_type_values(self):
        assert SubmissionType.RUN_ONLY == "RUN_ONLY"
        assert SubmissionType.OFFICIAL == "OFFICIAL"


# ---------------------------------------------------------------------------
# 5. 確認 ExamProblem 的 @property 行為（不需 DB）
# ---------------------------------------------------------------------------

class TestExamProblemProperties:
    """驗證 ExamProblem 的代理 property 在缺少關聯時的防禦邏輯。

    SQLAlchemy relationship descriptor 在 __get__ 時需要 instrumentation state，
    因此使用 unittest.mock.patch.object 取代 relationship descriptor，
    讓 property 的程式邏輯可在無 DB session 的情況下被單元測試覆蓋。
    """

    def test_title_returns_unknown_when_no_problem(self, monkeypatch):
        """problem 為 None 時，title property 應回傳 'Unknown Problem'。"""
        from unittest.mock import PropertyMock
        ep = ExamProblem.__new__(ExamProblem)
        # 以 monkeypatch 暫時替換 relationship descriptor，讓它回傳 None
        monkeypatch.setattr(
            type(ep), "problem",
            property(lambda self: None),
            raising=False,
        )
        assert ep.title == "Unknown Problem"

    def test_difficulty_returns_none_when_no_problem(self, monkeypatch):
        """problem 為 None 時，difficulty property 應回傳 None。"""
        ep = ExamProblem.__new__(ExamProblem)
        monkeypatch.setattr(
            type(ep), "problem",
            property(lambda self: None),
            raising=False,
        )
        assert ep.difficulty is None

    def test_title_delegates_to_problem(self, monkeypatch):
        """problem 存在時，title property 應回傳 problem.title。"""

        class _FakeProblem:
            title = "Hello World"
            difficulty = DifficultyLevel.Easy

        ep = ExamProblem.__new__(ExamProblem)
        fake = _FakeProblem()
        monkeypatch.setattr(
            type(ep), "problem",
            property(lambda self: fake),
            raising=False,
        )
        assert ep.title == "Hello World"

    def test_difficulty_delegates_to_problem(self, monkeypatch):
        """problem 存在時，difficulty property 應回傳 problem.difficulty。"""

        class _FakeProblem:
            title = "Hello"
            difficulty = DifficultyLevel.Hard

        ep = ExamProblem.__new__(ExamProblem)
        fake = _FakeProblem()
        monkeypatch.setattr(
            type(ep), "problem",
            property(lambda self: fake),
            raising=False,
        )
        assert ep.difficulty == DifficultyLevel.Hard


# ---------------------------------------------------------------------------
# 6. 整合測試：利用 db_session 建立並查詢各模型（需要 DB fixture）
# ---------------------------------------------------------------------------

@pytest.mark.integration
class TestModelsIntegrationWithDB:
    """整合驗證：在真實資料庫中實際建立各模型實例（需要 PostgreSQL，預設 skip）。"""

    def test_create_and_query_user(self, db_session):
        """應可建立 User 並從 DB 查回。"""
        import uuid
        u = User(
            id=uuid.uuid4(),
            username=f"init_test_user_{uuid.uuid4().hex[:6]}",
            password_hash="hashed",
            role=UserRole.Candidate,
        )
        db_session.add(u)
        db_session.commit()

        fetched = db_session.query(User).filter_by(username=u.username).first()
        assert fetched is not None
        assert fetched.role == UserRole.Candidate
        assert fetched.is_active is True  # 預設值

    def test_create_and_query_problem(self, db_session):
        """應可建立 Problem 並從 DB 查回，驗證預設值。"""
        import uuid
        creator = User(
            id=uuid.uuid4(),
            username=f"creator_{uuid.uuid4().hex[:6]}",
            password_hash="pw",
            role=UserRole.Questioner,
        )
        db_session.add(creator)
        db_session.flush()

        p = Problem(
            title=f"Init Test Problem {uuid.uuid4().hex[:6]}",
            description="A problem",
            difficulty=DifficultyLevel.Medium,
            creator_id=creator.id,
        )
        db_session.add(p)
        db_session.commit()

        fetched = db_session.query(Problem).filter_by(id=p.id).first()
        assert fetched is not None
        assert fetched.time_limit_ms == 1000  # 預設值
        assert fetched.memory_limit_mb == 256  # 預設值
        assert fetched.is_deleted is False    # 預設值

    def test_create_and_query_testcase(self, db_session):
        """應可建立 TestCase 並從 DB 查回，驗證 created_at 自動填入。"""
        import uuid
        creator = User(
            id=uuid.uuid4(),
            username=f"tc_creator_{uuid.uuid4().hex[:6]}",
            password_hash="pw",
            role=UserRole.Admin,
        )
        db_session.add(creator)
        db_session.flush()

        p = Problem(
            title=f"TC Problem {uuid.uuid4().hex[:6]}",
            description="desc",
            difficulty=DifficultyLevel.Easy,
            creator_id=creator.id,
        )
        db_session.add(p)
        db_session.flush()

        tc = TestCase(
            problem_id=p.id,
            input_data="1 2",
            expected_output="3",
            is_sample=True,
            score_weight=25,
        )
        db_session.add(tc)
        db_session.commit()

        fetched = db_session.query(TestCase).filter_by(id=tc.id).first()
        assert fetched is not None
        assert fetched.is_sample is True
        assert fetched.score_weight == 25
        assert fetched.created_at is not None

    def test_create_exam_and_exam_problem(self, db_session):
        """應可建立 Exam 與 ExamProblem，並驗證 ExamProblem 的 title property。"""
        import uuid
        interviewer = User(
            id=uuid.uuid4(),
            username=f"ep_interviewer_{uuid.uuid4().hex[:6]}",
            password_hash="pw",
            role=UserRole.Interviewer,
        )
        candidate = User(
            id=uuid.uuid4(),
            username=f"ep_candidate_{uuid.uuid4().hex[:6]}",
            password_hash="pw",
            role=UserRole.Candidate,
        )
        db_session.add_all([interviewer, candidate])
        db_session.flush()

        p = Problem(
            title=f"ExamProb {uuid.uuid4().hex[:6]}",
            description="desc",
            difficulty=DifficultyLevel.Hard,
            creator_id=interviewer.id,
        )
        exam = Exam(
            id=uuid.uuid4(),
            title="Init Exam",
            creator_id=interviewer.id,
            candidate_id=candidate.id,
            status=ExamStatus.Draft,
        )
        db_session.add_all([p, exam])
        db_session.flush()

        ep = ExamProblem(
            exam_id=exam.id,
            problem_id=p.id,
            sequence=1,
            points=100,
        )
        db_session.add(ep)
        db_session.commit()

        fetched = db_session.query(ExamProblem).filter_by(
            exam_id=exam.id, problem_id=p.id
        ).first()
        assert fetched is not None
        assert fetched.points == 100
        assert fetched.title == p.title          # property 代理
        assert fetched.difficulty == DifficultyLevel.Hard  # property 代理

    def test_create_submission_and_detail(self, db_session):
        """應可建立 Submission 與 SubmissionDetail，並驗證關聯導航。"""
        import uuid
        user = User(
            id=uuid.uuid4(),
            username=f"sub_user_{uuid.uuid4().hex[:6]}",
            password_hash="pw",
            role=UserRole.Candidate,
        )
        creator = User(
            id=uuid.uuid4(),
            username=f"sub_creator_{uuid.uuid4().hex[:6]}",
            password_hash="pw",
            role=UserRole.Admin,
        )
        db_session.add_all([user, creator])
        db_session.flush()

        p = Problem(
            title=f"Sub Problem {uuid.uuid4().hex[:6]}",
            description="desc",
            difficulty=DifficultyLevel.Easy,
            creator_id=creator.id,
        )
        db_session.add(p)
        db_session.flush()

        tc = TestCase(
            problem_id=p.id,
            input_data="input",
            expected_output="output",
        )
        db_session.add(tc)
        db_session.flush()

        sub = Submission(
            id=uuid.uuid4(),
            user_id=user.id,
            problem_id=p.id,
            language="python",
            code_s3_url="s3://test/code.py",
            status=JudgeStatus.AC,
            score=80,
            submission_type="OFFICIAL",
        )
        db_session.add(sub)
        db_session.flush()

        detail = SubmissionDetail(
            submission_id=sub.id,
            testcase_id=tc.id,
            status=JudgeStatus.AC,
            execution_time=50,
            memory_usage=32,
            score=80,
        )
        db_session.add(detail)
        db_session.commit()

        fetched_sub = db_session.query(Submission).filter_by(id=sub.id).first()
        assert fetched_sub is not None
        assert fetched_sub.score == 80
        assert fetched_sub.status == JudgeStatus.AC
        assert len(fetched_sub.details) == 1
        assert fetched_sub.details[0].execution_time == 50
