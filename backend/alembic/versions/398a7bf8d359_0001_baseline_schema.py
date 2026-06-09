"""0001_baseline_schema

Baseline snapshot — marks the existing create_all() schema as known to Alembic.

On a fresh install: alembic upgrade head creates all tables (future migrations build on this).
On an existing install: run `alembic stamp 398a7bf8d359` to register current state
without touching the schema, then run subsequent upgrades normally.

Revision ID: 398a7bf8d359
Revises:
Create Date: 2026-06-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '398a7bf8d359'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """No-op — existing schema was created via SQLAlchemy create_all()."""
    pass


def downgrade() -> None:
    """No-op — cannot safely drop a pre-existing baseline."""
    pass
