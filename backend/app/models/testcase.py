from sqlalchemy import Column, Integer, Text, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from app.db.base import Base


class TestCase(Base):
    """
    TestCase (測試案例)：批改程式碼的依據，一個題目會對應多組測資。
    
    - id (PK): Integer，測資編號。
    - problem_id (FK): Integer，關聯至 Problem 表。
    - input_data: Text，餵給程式的標準輸入。
    - expected_output: Text，預期輸出的正確答案。
    - is_sample: Boolean，是否為公開給考生看的範例測資。
    - score_weight: Integer，該側資佔分。
    """
    __test__ = False
    __tablename__ = "test_cases"

    # 欄位定義
    id = Column(Integer, primary_key=True, index=True)
    
    problem_id = Column(Integer, ForeignKey("problems.id", ondelete="CASCADE"), nullable=False)
    
    input_data = Column(Text, nullable=False) 
    expected_output = Column(Text, nullable=False)
    
    is_sample = Column(Boolean, default=False, nullable=False)

    score_weight = Column(Integer, default=10, nullable=False)

    # 關聯定義
    problem = relationship("Problem", back_populates="test_cases")