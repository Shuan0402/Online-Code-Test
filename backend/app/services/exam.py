# backend/app/services/exam.py
import logging
from sqlalchemy import text
from sqlalchemy.orm import Session

log = logging.getLogger(__name__)

class ExamService:
    @staticmethod
    def refresh_total_score(db: Session, exam_id: str) -> int:
        """
        考場總分實時刷新函數：一場考試的總分，等於該場考試中「每道題目」「最後一次繳交」的分數之總和。
        """
        score_query = db.execute(
            text("""
                SELECT COALESCE(SUM(score), 0) as total_exam_score
                FROM (
                    SELECT score,
                           ROW_NUMBER() OVER (
                               PARTITION BY problem_id 
                               ORDER BY created_at DESC
                           ) as rn
                      FROM submissions
                     WHERE exam_id = :exam_id
                ) as subquery
                WHERE rn = 1
            """),
            {"exam_id": exam_id}
        ).fetchone()

        new_total_score = score_query.total_exam_score if score_query else 0

        db.execute(
            text("UPDATE exams SET score = :new_score WHERE id = :exam_id"),
            {"new_score": new_total_score, "exam_id": exam_id}
        )
        db.commit()
        log.info("[Service] 考場總分已刷新: Exam: %s -> New Score: %s", exam_id, new_total_score)
        return new_total_score

exam_service = ExamService()