from typing import Any
from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    """
    所有 SQLAlchemy Models 的基底類別。
    使用 SQLAlchemy 2.0 的 DeclarativeBase 語法。
    """
    id: Any