"""0003_agent_task_org_id_not_null

Make AgentTask.org_id NOT NULL.

All other enterprise models (WorkspaceShare, DocumentLibrary, KPISnapshot, etc.)
have org_id NOT NULL. AgentTask was inconsistent — NULL org_id bypasses org-scoped
task list queries. This migration backfills nulls via the task owner's actual org
(users.default_org_id, falling back to their earliest org_memberships row), so
existing tasks land in the org they actually belong to rather than being lumped
into a single org. Only rows with no resolvable user/org relationship (e.g. the
owning account was deleted) fall back to the lowest org_id, purely so NOT NULL can
be enforced — those should be audited manually after the migration runs.

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
    # Backfill 1: each task's org is the task owner's default org
    op.execute("""
        UPDATE agent_tasks at
        SET org_id = u.default_org_id
        FROM users u
        WHERE at.username = u.username
          AND at.org_id IS NULL
          AND u.default_org_id IS NOT NULL
    """)

    # Backfill 2: owner has no default org — use their earliest org membership
    op.execute("""
        UPDATE agent_tasks at
        SET org_id = m.org_id
        FROM (
            SELECT DISTINCT ON (username) username, org_id
            FROM org_memberships
            ORDER BY username, joined_at ASC
        ) m
        WHERE at.username = m.username
          AND at.org_id IS NULL
    """)

    # Backfill 3: last-resort fallback for rows with no resolvable user/org
    # relationship (e.g. the owning account was deleted). Assigns the lowest
    # org_id purely so NOT NULL can be enforced below — audit these manually.
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
