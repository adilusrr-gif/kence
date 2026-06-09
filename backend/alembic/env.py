"""Alembic env.py — integrates with the app's database engine and models."""
import os
import sys
from logging.config import fileConfig
from pathlib import Path

# Ensure the backend/ directory is on sys.path so app imports resolve
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import engine_from_config, pool, text
from alembic import context

# ── App imports ────────────────────────────────────────────────────────────────
# Load .env if present (for local dev convenience — not required in production)
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass  # python-dotenv not installed — environment must already be set

from app.models import models as _models_module  # noqa: F401 — registers all ORM models
from app.core.database import Base

target_metadata = Base.metadata

# ── Alembic config ─────────────────────────────────────────────────────────────
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def _get_url() -> str:
    """Read DATABASE_URL from environment. Fails loudly if not set."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL environment variable is not set. "
            "Set it in .env or export it before running alembic."
        )
    # SQLAlchemy ≥ 1.4 requires postgresql+psycopg2:// not postgres://
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    return url


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (generates SQL script, no live connection)."""
    context.configure(
        url=_get_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live database connection."""
    # Override sqlalchemy.url from environment (never read from alembic.ini)
    config.set_main_option("sqlalchemy.url", _get_url())

    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,      # detect column type changes
            compare_server_default=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
