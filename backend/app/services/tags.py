from typing import List

from sqlalchemy.orm import Session

from app.models.candidate_tag import CandidateTag
from app.models.exam import Exam


def normalize_tags(tags: List[str]) -> List[str]:
    """去除空白、去重並保留順序。"""
    seen: set[str] = set()
    result: list[str] = []
    for raw in tags:
        trimmed = raw.strip()
        if not trimmed or trimmed in seen:
            continue
        seen.add(trimmed)
        result.append(trimmed)
    return result


def get_all_unique_tags(db: Session) -> List[str]:
    """取得系統中所有已使用的標籤（考試 + 考生）。"""
    exam_tags = (
        db.query(Exam.tag)
        .filter(Exam.tag.isnot(None))
        .filter(Exam.tag != "")
        .distinct()
        .all()
    )
    candidate_tags = db.query(CandidateTag.tag).distinct().all()
    combined: set[str] = set()
    for row in exam_tags + candidate_tags:
        if row[0]:
            combined.add(row[0])
    return sorted(combined)


def replace_candidate_tags(db: Session, user_id, tags: List[str]) -> None:
    """以新清單完全取代考生的標籤。"""
    normalized = normalize_tags(tags)
    db.query(CandidateTag).filter(CandidateTag.user_id == user_id).delete()
    for tag in normalized:
        db.add(CandidateTag(user_id=user_id, tag=tag))
