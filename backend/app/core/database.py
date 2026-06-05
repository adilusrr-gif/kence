"""Database engine with production-grade connection pool settings.

Improvements vs original:
- pool_recycle: prevents stale connections after network blip
- pool_timeout: fail fast instead of hanging forever (30s)
- connect_timeout: DB-level TCP timeout
- pool_pre_ping: verify connection before use (already present)
- max_overflow 20 → 30 for 100-user load
"""
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import QueuePool
from app.core.config import get_settings
import logging

logger = logging.getLogger(__name__)
settings = get_settings()

_is_sqlite = settings.DATABASE_URL.startswith("sqlite")

if _is_sqlite:
    engine = create_engine(
        settings.DATABASE_URL,
        connect_args={"check_same_thread": False},
        pool_pre_ping=False,
        echo=False,
    )
else:
    engine = create_engine(
        settings.DATABASE_URL,
        # Pool sizing for 100 concurrent users
        pool_size=15,           # base connections (was 10)
        max_overflow=35,        # burst connections (was 20) → total 50
        pool_recycle=1800,      # recycle connections every 30 min (prevents stale)
        pool_timeout=30,        # fail fast if no connection available (was: hang forever)
        pool_pre_ping=True,     # test connection before use
        connect_args={
            "connect_timeout": 10,   # TCP connection timeout in seconds
            "options": "-c statement_timeout=60000",  # 60s max query time
        },
        echo=False,
    )

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    from app.models import models  # noqa: F401 — registers all models
    Base.metadata.create_all(bind=engine)


async def check_db_health() -> dict:
    """Async DB health check — returns status dict."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "pool_size": engine.pool.size(),
                "checked_out": engine.pool.checkedout()}
    except Exception as e:
        logger.error("[db] health check failed: %s", e)
        return {"status": "down", "error": str(e)}
