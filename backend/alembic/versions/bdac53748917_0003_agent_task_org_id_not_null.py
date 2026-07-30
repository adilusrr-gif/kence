"""0003_agent_task_org_id_not_null

Make AgentTask.org_id NOT NULL.

All other enterprise models (WorkspaceShare, DocumentLibrary, KPISnapshot, etc.)
have org_id NOT NULL. AgentTask was inconsistent — NULL org_id bypasses org-scoped
task list queries. This migration backfills nulls to org_id=1 (the default org),
then enforces NOT NULL.

IMPORTANT: Requires a maintenance window — table-level rewrite on PostgreSQL.
           Take a pg_dump snapshot before running.

Revision ID: bdac53748917
Revises: 02805ff7fe64
Create Date: 2026-06-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'bdac53748917'
down_revision: Union[str, Sequence[str], None] = '02805ff7fe64'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Backfill: assign all orphaned tasks to the lowest org_id that exists
    op.execute("""
        UPDATE agent_tasks
        SET org_id = (SELECT id FROM organizations ORDER BY id LIMIT 1)
        WHERE org_id IS NULL
    """)

    # Enforce NOT NULL now that no nulls remain
    op.alter_column(
        "agent_tasks",
        "org_id",
        existing_type=sa.Integer(),
        nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "agent_tasks",
        "org_id",
        existing_type=sa.Integer(),
        nullable=True,
    )
