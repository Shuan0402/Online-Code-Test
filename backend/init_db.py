from app.database import engine, Base
from app.models.user import User
from app.models.problem import Problem
from app.models.test_case import TestCase
from app.models.submission import Submission

def init_db():
    Base.metadata.create_all(bind=engine)
    print("資料表已建立成功")
    
if __name__ == "__main__":
    init_db()