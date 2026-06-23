"""
core/database.py — Async SQLAlchemy engine, session factory, and Base model.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from core.config import settings

engine_kwargs: dict = {
    "echo": settings.DEBUG,
    "pool_pre_ping": True,
    "pool_size": 5,
    "max_overflow": 10,
    "pool_timeout": 30,
    "pool_recycle": 1800,
}

if "pooler.supabase.com" in settings.DATABASE_URL:
    # Session-mode pooler (port 5432) supports persistent connections.
    # Disable asyncpg's prepared-statement cache to stay compatible with pgbouncer.
    engine_kwargs["connect_args"] = {
        "statement_cache_size": 0,
        "prepared_statement_name_func": lambda: f"__asyncpg_{uuid.uuid4().hex}__",
        "timeout": 30,
        "command_timeout": 60,
    }
else:
    pass  # local postgres — use defaults above

engine = create_async_engine(settings.DATABASE_URL, **engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


async def get_db() -> AsyncSession:
    """FastAPI dependency that yields an async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
