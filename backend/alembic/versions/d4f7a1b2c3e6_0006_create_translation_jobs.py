"""0006_create_translation_jobs

Create the translation_jobs table backing background document translation
(PART 2). The model lives in app/models/models.py:TranslationJob and is also
created at startup by Base.metadata.create_all(); this migration brings the
migration-managed schema in sync so environments driven by `alembic upgrade
head` get the same table.

Because the app also runs create_all() on startup, the table may already exist
in a given environment. The upgrade is therefore idempotent — it inspects the
database and skips creation if the table is already present, so the two
mechanisms never collide.

Index names mirror SQLAlchemy's defaults (ix_<table>_<column>) so a table made
by create_all and one made by this migration are byte-for-byte equivalent.

Revision ID: d4f7a1b2c3e6
Revises: c9e2f1a3b4d5
Create Date: 2026-06-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4f7a1b2c3e6'
down_revision: Union[str, Sequence[str], None] = 'c9e2f1a3b4d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "translation_jobs" in inspector.get_table_names():
        # Already created by Base.metadata.create_all() at app startup.
        return

    op.create_table(
        "translation_jobs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "org_id", sa.Integer(),
            sa.ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column(
            "username", sa.String(length=64),
            sa.ForeignKey("users.username", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("session_id", sa.String(length=64), nullable=True),
        sa.Column("document_name", sa.String(length=256), nullable=True),
        sa.Column("source_language", sa.String(length=8), nullable=True),
        sa.Column("target_language", sa.String(length=8), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("total_chunks", sa.Integer(), nullable=False),
        sa.Column("done_chunks", sa.Integer(), nullable=False),
        sa.Column("source_chars", sa.Integer(), nullable=False),
        sa.Column("source_text", sa.Text(), nullable=True),
        sa.Column("translated_text", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=False),
        sa.Column("max_retries", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            server_default=sa.func.now(), onupdate=sa.func.now(),
        ),
    )

    # Single-column indexes (match model's index=True → ix_<table>_<column>).
    op.create_index("ix_translation_jobs_org_id", "translation_jobs", ["org_id"])
    op.create_index("ix_translation_jobs_username", "translation_jobs", ["username"])
    op.create_index("ix_translation_jobs_session_id", "translation_jobs", ["session_id"])
    op.create_index("ix_translation_jobs_status", "translation_jobs", ["status"])
    op.create_index("ix_translation_jobs_created_at", "translation_jobs", ["created_at"])

    # Composite indexes (match model's __table_args__).
    op.create_index(
        "ix_translation_jobs_user_created", "translation_jobs", ["username", "created_at"],
    )
    op.create_index(
        "ix_translation_jobs_status_created", "translation_jobs", ["status", "created_at"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "translation_jobs" not in inspector.get_table_names():
        return
    op.drop_index("ix_translation_jobs_status_created", table_name="translation_jobs")
    op.drop_index("ix_translation_jobs_user_created", table_name="translation_jobs")
    op.drop_index("ix_translation_jobs_created_at", table_name="translation_jobs")
    op.drop_index("ix_translation_jobs_status", table_name="translation_jobs")
    op.drop_index("ix_translation_jobs_session_id", table_name="translation_jobs")
    op.drop_index("ix_translation_jobs_username", table_name="translation_jobs")
    op.drop_index("ix_translation_jobs_org_id", table_name="translation_jobs")
    op.drop_table("translation_jobs")
