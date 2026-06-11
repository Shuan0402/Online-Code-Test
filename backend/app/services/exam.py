# backend/app/services/exam.py
import logging
import uuid
from sqlalchemy import select, func, update
from sqlalchemy.orm import Session
from app.models.submission import Submission
from app.models.exam import Exam

log = logging.getLogger(__name__)

class ExamService:
    @staticmethod
    def refresh_total_score(db: Session, exam_id: str) -> int:
        """
        考場總分實時刷新函數：一場考試的總分，等於該場考試中「每道題目」「最後一次繳交」的分數之總和。
        """
        exam_uuid = uuid.UUID(exam_id) if isinstance(exam_id, str) else exam_id

        # 只算 OFFICIAL 正式繳交、不算 RUN_ONLY 試跑；不然試跑的 0 分會蓋掉真正的 OFFICIAL 分數
        # Subquery to calculate row number partitions
        subq = (
            select(
                Submission.score,
                func.row_number().over(
                    partition_by=Submission.problem_id,
                    order_by=Submission.created_at.desc()
                ).label('rn')
            )
            .where(Submission.exam_id == exam_uuid)
            .where(Submission.submission_type == "OFFICIAL")
            .subquery()
        )

        # Query to sum the latest submissions
        score_query = db.execute(
            select(func.coalesce(func.sum(subq.c.score), 0).label('total_exam_score'))
            .where(subq.c.rn == 1)
        ).fetchone()

        new_total_score = score_query.total_exam_score if score_query else 0

        # Update the exam score
        db.execute(
            update(Exam)
            .where(Exam.id == exam_uuid)
            .values(score=new_total_score)
        )
        db.commit()
        log.info("[Service] 考場總分已刷新: Exam: %s -> New Score: %s", exam_id, new_total_score)
        return new_total_score

exam_service = ExamService()