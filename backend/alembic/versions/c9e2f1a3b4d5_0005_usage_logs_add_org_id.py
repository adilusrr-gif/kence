"""0005_usage_logs_add_org_id

Add org_id column to usage_logs and create composite indexes for analytics queries.

Without this column every log_event() call fails with UndefinedColumn and is
swallowed by the except clause, resulting in 0 rows ever written to usage_logs.
Column is NULLABLE so it can be applied online without downtime and to allow
events without an org context (e.g. login before org selection).

Revision ID: c9e2f1a3b4d5
Revises: a3d1dc26da57
Create Date: 2026-06-08
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c9e2f1a3b4d5'
down_revision: Union[str, Sequence[str], None] = 'a3d1dc26da57'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Step 1: Add nullable org_id column — zero-downtime on PostgreSQL
    op.add_column(
        "usage_logs",
        sa.Column(
            "org_id",
            sa.Integer(),
            sa.ForeignKey("organizations.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # Step 2: Create composite indexes for analytics queries
    # ix_usage_logs_org_event — used by get_overview() GROUP BY event_type per org
    op.create_index(
        "ix_usage_logs_org_event",
        "usage_logs",
        ["org_id", "event_type"],
    )

    # ix_usage_logs_org_created — used by get_timeline() and compute_kpi_snapshot()
    op.create_index(
        "ix_usage_logs_org_created",
        "usage_logs",
        ["org_id", "created_at"],
    )

    # Step 3: Simple org_id index for single-column queries
    op.create_index(
        "ix_usage_logs_org_id",
        "usage_logs",
        ["org_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_usage_logs_org_id", table_name="usage_logs")
    op.drop_index("ix_usage_logs_org_created", table_name="usage_logs")
    op.drop_index("ix_usage_logs_org_event", table_name="usage_logs")
    op.drop_column("usage_logs", "org_id")
