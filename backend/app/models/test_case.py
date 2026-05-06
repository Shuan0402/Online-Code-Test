from sqlalchemy import Column, Integer, Text, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from app.database import Base

class TestCase(Base):
    """TestCase (測資)：存放題目的測試資料。
    
    - id (PK): Integer。
    - problem_id (FK): Integer，關聯至 Problem 表。
    - input_data: Text，餵給程式的標準輸入。
    - expected_output: Text，預期輸出的正確答案。
    - is_sample: Boolean，是否為公開給考生看的範例測資。
    """
    __test__ = False
    __tablename__ = "test_cases"

    id = Column(Integer, primary_key=True, index=True)
    problem_id = Column(Integer, ForeignKey("problems.id"))
    input_data = Column(Text, nullable=False) 
    expected_output = Column(Text, nullable=False)
    is_sample = Column(Boolean, default=False)

    problem = relationship("Problem", back_populates="test_cases")