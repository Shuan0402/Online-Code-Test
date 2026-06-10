from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import String

from app.db.base import Base


def test_base_is_declarative_base_class():
    assert issubclass(Base, DeclarativeBase)
    assert Base.__name__ == 'Base'


def test_model_can_inherit_base_and_define_table():
    class DummyModel(Base):
        __tablename__ = 'dummy_models'
        id: Mapped[int] = mapped_column(primary_key=True)
        name: Mapped[str] = mapped_column(String(32), nullable=False)

    assert issubclass(DummyModel, Base)
    assert DummyModel.__tablename__ == 'dummy_models'
    assert DummyModel.__table__.name == 'dummy_models'
    assert 'id' in DummyModel.__table__.c
    assert 'name' in DummyModel.__table__.c
    assert DummyModel.__table__.c['name'].nullable is False
