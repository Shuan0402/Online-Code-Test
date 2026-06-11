import uuid
from sqlalchemy import Column, String, UUID, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from app.db.base import Base


class CandidateTag(Base):
    """考生標籤：一位考生可擁有多個標籤，標籤字串與考試標籤共用同一套詞彙。"""

    __tablename__ = "candidate_tags"
    __table_args__ = (
        UniqueConstraint("user_id", "tag", name="uq_candidate_tag_user_tag"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    tag = Column(String(255), nullable=False)

    user = relationship("User", back_populates="candidate_tags")
