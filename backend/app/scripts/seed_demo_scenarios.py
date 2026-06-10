# backend/app/scripts/seed_demo_scenarios.py
import logging
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
import boto3
from botocore.client import Config

# 確保運行時能正確將專案根目錄加入路徑
sys.path.append(os.getcwd())

from app.db.session import SessionLocal
from app.models.user import User, UserRole
from app.models.problem import Problem
from app.models.testcase import TestCase
from app.models.exam import Exam, ExamProblem
from app.models.submission import Submission, SubmissionDetail

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("demo_seed")

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "http://minio:9000")  # NOSONAR — internal Docker Compose networking 
MINIO_ACCESS_KEY = os.getenv("MINIO_USER", "octest-admin")        
MINIO_SECRET_KEY = os.getenv("MINIO_PASSWORD", "changeme-minio")  
BUCKET_NAME = "octest-submissions"
DEMO_CLIENT_IP = os.getenv("DEMO_CLIENT_IP", "140.114.42.1")  # NOSONAR — demo seed script only

s3_client = boto3.client(
    "s3",
    endpoint_url=MINIO_ENDPOINT,
    aws_access_key_id=MINIO_ACCESS_KEY,
    aws_secret_access_key=MINIO_SECRET_KEY,
    config=Config(signature_version="s3v4"),
    region_name=os.getenv("AWS_DEFAULT_REGION", "us-east-1")
)


def upload_to_minio(object_key: str, code_content: str) -> None:
    """自動將程式碼內容上傳至 MinIO 物件儲存"""
    try:
        s3_client.put_object(
            Bucket=BUCKET_NAME,
            Key=object_key,
            Body=code_content.encode("utf-8"),
            ContentType="text/plain",
            ExpectedBucketOwner=os.getenv("AWS_ACCOUNT_ID")
        )
        logger.info(f"   [MinIO Sync] 實體程式碼上傳成功 -> Key: {object_key}")
    except Exception as e:
        logger.exception(f"[MinIO Error] 檔案上傳失敗，請檢查 MinIO 服務或 Bucket 設定: {e}")


def seed_demo_data(db: Session) -> None:
    logger.info("正在注入 Online-Code-Test 專屬高動態 Demo 演示場景")

    interviewer = db.query(User).filter(User.role == UserRole.Interviewer).first()
    candidate_a = db.query(User).filter(User.username == "candidate01@nthu.edu.tw").first()
    candidate_b = db.query(User).filter(User.username == "candidate02@nthu.edu.tw").first()

    if not all([interviewer, candidate_a, candidate_b]):
        logger.error("核心帳號缺失！請務必先執行過 python app/db/init_db.py 建立預設使用者。")
        return

    problems = db.query(Problem).order_by(Problem.id).all()
    if len(problems) < 9:
        logger.error("題庫數量低於 9 題！請確認 seeds/problems.json 是否有正常注入資料庫。")
        return

    easy_probs = [p for p in problems if p.difficulty == "Easy"]
    medium_probs = [p for p in problems if p.difficulty == "Medium"]
    hard_probs = [p for p in problems if p.difficulty == "Hard"]

    now = datetime.now(timezone.utc)

    try:
        s3_client.head_bucket(
            Bucket=BUCKET_NAME,
            ExpectedBucketOwner=os.getenv("AWS_ACCOUNT_ID")
        )
    except Exception:
        try:
            s3_client.create_bucket(Bucket=BUCKET_NAME)
            logger.info(f"偵測到缺失，自動建立 MinIO Bucket: {BUCKET_NAME}")
        except Exception as e:
            logger.warning(f"無法自動建桶，請至 MinIO 後台(9001)確認 Bucket '{BUCKET_NAME}' 狀況: {e}")


    title_1 = "【綜合成果演示】動態沙箱全狀態判題報告 (AC/WA/CE/TLE)"
    db.query(Exam).filter(Exam.title == title_1).delete()
    
    exam_1 = Exam(
        id=uuid.uuid4(), title=title_1, creator_id=interviewer.id, candidate_id=candidate_a.id,
        duration_minutes=60, start_time=now - timedelta(hours=2), end_time=now - timedelta(hours=1),
        status="Finished", score=50, easy_count=2, medium_count=1, hard_count=1, created_at=now - timedelta(days=1)
    )
    db.add(exam_1)
    db.flush()

    for seq, prob in enumerate([easy_probs[0], easy_probs[1], medium_probs[1], hard_probs[1]], start=1):
        db.add(ExamProblem(exam_id=exam_1.id, problem_id=prob.id, sequence=seq, points=25))
    db.flush()
    logger.info(f"注入考卷成功: {title_1}")

    p_ac = easy_probs[1]
    tcs_ac = db.query(TestCase).filter(TestCase.problem_id == p_ac.id).all()
    key_ac = f"submissions/{uuid.uuid4().hex}.py"
    upload_to_minio(key_ac, "a, b = map(int, input().split())\nprint(a + b)\n")
    sub_ac = Submission(
        id=uuid.uuid4(), user_id=candidate_a.id, problem_id=p_ac.id, exam_id=exam_1.id,
        submission_type="OFFICIAL", language="python", code_s3_url=key_ac, status="AC", score=50,
        client_ip=DEMO_CLIENT_IP, execution_time=45, memory_usage=12, judge_log="[tc 1] Success\n[tc 2] Success", created_at=now - timedelta(minutes=90)
    )
    db.add(sub_ac)
    db.flush()
    for tc in tcs_ac:
        db.add(SubmissionDetail(submission_id=sub_ac.id, testcase_id=tc.id, status="AC", execution_time=20, memory_usage=10, score=tc.score_weight, runtime_info="Execution success."))

    p_wa = easy_probs[0]
    tcs_wa = db.query(TestCase).filter(TestCase.problem_id == p_wa.id).all()
    key_wa = f"submissions/{uuid.uuid4().hex}.py"
    upload_to_minio(key_wa, "print(1)  # 故意寫錯答案，預期輸出應為 0\n")
    sub_wa = Submission(
        id=uuid.uuid4(), user_id=candidate_a.id, problem_id=p_wa.id, exam_id=exam_1.id,
        submission_type="OFFICIAL", language="python", code_s3_url=key_wa, status="WA", score=0,
        client_ip=DEMO_CLIENT_IP, execution_time=32, memory_usage=12, judge_log="[tc 1] Wrong Answer\n[tc 2] Wrong Answer",
        failure_reason="AssertionError: 預期輸出為 '0\\n'，但面試者程式實際輸出為 '1\\n'。", created_at=now - timedelta(minutes=80)
    )
    db.add(sub_wa)
    db.flush()
    for idx, tc in enumerate(tcs_wa):
        db.add(SubmissionDetail(submission_id=sub_wa.id, testcase_id=tc.id, status="WA", execution_time=15, memory_usage=11, score=0, runtime_info=f"Testcase {idx+1} Failed.\nExpected: 0\nGot: 1"))

    p_ce = medium_probs[1]
    tcs_ce = db.query(TestCase).filter(TestCase.problem_id == p_ce.id).all()
    key_ce = f"submissions/{uuid.uuid4().hex}.cpp"
    upload_to_minio(key_ce, "#include <iostream>\nint main() {\n    int n;\n    std::cin >> n\n    std::cout << n * n;\n    return 0;\n}")
    sub_ce = Submission(
        id=uuid.uuid4(), user_id=candidate_a.id, problem_id=p_ce.id, exam_id=exam_1.id,
        submission_type="OFFICIAL", language="cpp", code_s3_url=key_ce, status="CE", score=0,
        client_ip=DEMO_CLIENT_IP, execution_time=0, memory_usage=0, judge_log="Compile Failed",
        failure_reason="solution.cpp: In function 'int main()':\nsolution.cpp:5:18: error: expected ';' before 'return'\n     std::cout << n\n                  ^\n                  ;", created_at=now - timedelta(minutes=70)
    )
    db.add(sub_ce)
    db.flush()
    for tc in tcs_ce:
        db.add(SubmissionDetail(submission_id=sub_ce.id, testcase_id=tc.id, status="CE", execution_time=0, memory_usage=0, score=0, runtime_info="Compile error occurred before execution."))

    p_tle = hard_probs[1]
    tcs_tle = db.query(TestCase).filter(TestCase.problem_id == p_tle.id).all()
    key_tle = f"submissions/{uuid.uuid4().hex}.py"
    upload_to_minio(key_tle, "import time\nwhile True:\n    pass  # 惡意死迴圈模擬\n")
    sub_tle = Submission(
        id=uuid.uuid4(), user_id=candidate_a.id, problem_id=p_tle.id, exam_id=exam_1.id,
        submission_type="OFFICIAL", language="python", code_s3_url=key_tle, status="TLE", score=0,
        client_ip=DEMO_CLIENT_IP, execution_time=2000, memory_usage=15, judge_log="[tc 1] Time Limit Exceeded",
        failure_reason="Time Limit Exceeded: 該題評測時間上限為 2000ms，評測沙箱偵測到超時進程，已強制中斷（Kill）。", created_at=now - timedelta(minutes=60)
    )
    db.add(sub_tle)
    db.flush()
    for tc in tcs_tle:
        db.add(SubmissionDetail(submission_id=sub_tle.id, testcase_id=tc.id, status="TLE", execution_time=2000, memory_usage=15, score=0, runtime_info="SIGKILL: Process terminated due to timeout."))

    title_2 = "【權限防線】出題主管專用 - 考卷編排 Draft 草稿空間"
    db.query(Exam).filter(Exam.title == title_2).delete()
    exam_2 = Exam(
        id=uuid.uuid4(), title=title_2, creator_id=interviewer.id, candidate_id=candidate_a.id,
        duration_minutes=30, status="Draft", score=0, easy_count=1, medium_count=1, hard_count=1, created_at=now
    )
    db.add(exam_2)
    db.flush()
    for seq, prob in enumerate([easy_probs[2], medium_probs[2], hard_probs[2]], start=1):
        db.add(ExamProblem(exam_id=exam_2.id, problem_id=prob.id, sequence=seq, points=33))
    logger.info(f"注入考卷成功: {title_2}")
    
    title_3 = "限時 1 分鐘 - 考卷逾時自動關閉與交卷機制"
    db.query(Exam).filter(Exam.title == title_3).delete()
    exam_3 = Exam(
        id=uuid.uuid4(), title=title_3, creator_id=interviewer.id, candidate_id=candidate_b.id,
        duration_minutes=1, status="Published", score=0, easy_count=1, medium_count=1, hard_count=1, created_at=now
    )
    db.add(exam_3)
    db.flush()
    for seq, prob in enumerate([easy_probs[1], medium_probs[1], hard_probs[1]], start=1):
        db.add(ExamProblem(exam_id=exam_3.id, problem_id=prob.id, sequence=seq, points=33))
    logger.info(f"注入考卷成功: {title_3}")

    title_4 = "【狀態機測試】已發布尚未開始 - 考生應試資格核定"
    db.query(Exam).filter(Exam.title == title_4).delete()
    exam_4 = Exam(
        id=uuid.uuid4(), title=title_4, creator_id=interviewer.id, candidate_id=candidate_b.id,
        duration_minutes=60, status="Published", score=0, easy_count=1, medium_count=1, hard_count=1, created_at=now
    )
    db.add(exam_4)
    db.flush()
    for seq, prob in enumerate([easy_probs[0], medium_probs[0], hard_probs[0]], start=1):
        db.add(ExamProblem(exam_id=exam_4.id, problem_id=prob.id, sequence=seq, points=33))
    logger.info(f"注入考卷成功: {title_4}")


    db.commit()
    logger.info(" Demo 考卷與 MinIO 實體程式碼已全數同步到位！")


if __name__ == "__main__":
    db_session = SessionLocal()
    try:
        seed_demo_data(db_session)
    finally:
        db_session.close()