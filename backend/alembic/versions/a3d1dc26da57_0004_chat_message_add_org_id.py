"""0004_chat_message_add_org_id

Add org_id column to chat_messages for efficient org-scoped analytics queries.

Without this column, "all messages for org X" requires a JOIN through doc_sessions —
expensive at scale. Added as NULLABLE so it can be applied online without downtime.
Backfilled via a JOIN on doc_sessions. A follow-up migration can enforce NOT NULL
after backfill is verified in production.

Revision ID: a3d1dc26da57
Revises: bdac53748917
Create Date: 2026-06-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a3d1dc26da57'
down_revision: Union[str, Sequence[str], None] = 'bdac53748917'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Step 1: Add nullable column — zero-downtime on PostgreSQL
    op.add_column(
        "chat_messages",
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=True),
    )

    # Step 2: Backfill via JOIN on doc_sessions
    op.execute("""
        UPDATE chat_messages cm
        SET org_id = ds.org_id
        FROM doc_sessions ds
        WHERE cm.session_id = ds.session_id
          AND ds.org_id IS NOT NULL
    """)

    # Step 3: Add index for the new column (supports org-scoped analytics)
    op.create_index("ix_chat_messages_org_id", "chat_messages", ["org_id"])


def downgrade() -> None:
    op.drop_index("ix_chat_messages_org_id", table_name="chat_messages")
    op.drop_column("chat_messages", "org_id")
