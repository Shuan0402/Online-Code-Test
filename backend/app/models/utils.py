import uuid
import sqlalchemy.types as types
from sqlalchemy.dialects.postgresql import UUID

class GUID(types.TypeDecorator):
    """
    平台無關的 UUID 型別。
    在 PostgreSQL 使用 UUID 型別，在 SQLite 使用 String(36)。
    """
    impl = types.String
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(UUID())
        else:
            return dialect.type_descriptor(types.String(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        else:
            return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        else:
            if isinstance(value, uuid.UUID):
                return value
            return uuid.UUID(value)