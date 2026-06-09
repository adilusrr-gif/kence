"""0002_workspace_share_partial_unique

Add partial unique indexes to workspace_shares that were only code comments in models.py.

SQLAlchemy cannot express partial unique indexes via model __table_args__, so they
live here as explicit DDL. They prevent:
  - Duplicate per-user shares: same session shared twice to the same user
  - Duplicate org-wide shares: same session shared twice to the whole org

Revision ID: 02805ff7fe64
Revises: 398a7bf8d359
Create Date: 2026-06-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '02805ff7fe64'
down_revision: Union[str, Sequence[str], None] = '398a7bf8d359'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Remove duplicate rows before creating unique constraints (keep lowest id)
    op.execute("""
        DELETE FROM workspace_shares
        WHERE id NOT IN (
            SELECT MIN(id) FROM workspace_shares
            WHERE shared_with IS NOT NULL
            GROUP BY session_id, shared_with
        )
        AND shared_with IS NOT NULL
    """)

    op.execute("""
        DELETE FROM workspace_shares
        WHERE id NOT IN (
            SELECT MIN(id) FROM workspace_shares
            WHERE shared_with IS NULL
            GROUP BY session_id, org_id
        )
        AND shared_with IS NULL
    """)

    # Partial unique: one share per (session, user) for user-targeted shares
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_session_share_user
        ON workspace_shares (session_id, shared_with)
        WHERE shared_with IS NOT NULL
    """)

    # Partial unique: one org-wide share per (session, org) for org-level shares
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_session_share_org
        ON workspace_shares (session_id, org_id)
        WHERE shared_with IS NULL
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_session_share_user")
    op.execute("DROP INDEX IF EXISTS uq_session_share_org")
