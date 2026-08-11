"""b0_squashed_baseline

Squashed baseline. Sole active migration — the genuine new root of the
Alembic chain (down_revision = None). Historical migrations 0001-0007 are
preserved unchanged in backend/alembic/versions_archive/, outside the
active version_locations scan path; they are never executed again. See
docs/ALEMBIC_SCHEMA_RECONCILIATION_STAGE_E2_REV3_2026-08-05.md for the full
design rationale.

upgrade() builds the complete, fully-corrected schema in one pass, driven
entirely by frozen, explicit content:

  1. b0_baseline.sql — a static SQL file, captured once via `pg_dump
     --schema-only` from a disposable database built by the CURRENT
     `create_tables()` + `_ensure_schema_upgrades()` (the two mechanisms
     that have actually provisioned every real environment to date, per
     Stage A/E.1's evidence) and cleaned of pg_dump/psql boilerplate
     (\\restrict, SET, comments). This file is read and executed verbatim —
     this migration file itself never imports app.models, app.core.database,
     or Base.metadata, and never calls create_all(); see
     ops/schema_audit/check_frozen_migrations.py, which enforces this for
     every active migration in CI.

  2. Three corrections, applied as explicit DDL after the base schema,
     each one independently re-derived and confirmed empirically this
     session (not copied from a prior document) against the disposable
     "b0source" database built in step 1's capture:

     a. document_library.doc_kind gains a server-side DEFAULT. Confirmed
        absent from the captured baseline: the ORM model only declares a
        Python-side default=, and _ensure_schema_upgrades()'s
        `ADD COLUMN IF NOT EXISTS ... DEFAULT 'document'` is a true no-op
        once create_tables() has already created the column without one
        (verified via `SELECT column_default ...` against the disposable
        capture — empty, matching Stage A drift #4's original finding).

     b. workspace_shares gains its two partial unique indexes. These have
        never been created by create_tables() or _ensure_schema_upgrades()
        (SQLAlchemy cannot express a partial unique index via
        __table_args__ — see WorkspaceShare's own docstring) — confirmed
        absent from the disposable capture (`\\d workspace_shares` /
        `pg_indexes` showed only the 4 plain indexes, matching Stage A
        drift #1). No duplicate preflight is needed here (unlike the
        adoption tool's use of the same DDL against a populated legacy
        database) because this migration only ever runs against a database
        it is itself building from nothing — there are no rows yet.

     c. usage_logs_org_id_fkey is replaced with ON DELETE SET NULL.
        Confirmed via `pg_get_constraintdef` against the disposable capture:
        `FOREIGN KEY (org_id) REFERENCES organizations(id)` with no ON
        DELETE clause (i.e. NO ACTION) — matching Stage A drift #2.

Revision ID: bc59de168869
Revises:
Create Date: 2026-08-05
"""
from pathlib import Path
from typing import Sequence, Union

from alembic import op

revision: str = "bc59de168869"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_BASELINE_SQL_PATH = Path(__file__).parent / "b0_baseline.sql"


def upgrade() -> None:
    baseline_sql = _BASELINE_SQL_PATH.read_text()
    op.execute(baseline_sql)

    # Correction (a): document_library.doc_kind server default.
    op.execute(
        "ALTER TABLE document_library ALTER COLUMN doc_kind SET DEFAULT 'document'"
    )

    # Correction (b): workspace_shares partial unique indexes. Ordinary
    # transactional CREATE UNIQUE INDEX (no CONCURRENTLY) — safe and
    # instantaneous because this table was just created empty above, in
    # this same migration, in this same transaction.
    op.execute(
        "CREATE UNIQUE INDEX uq_session_share_user "
        "ON workspace_shares (session_id, shared_with) "
        "WHERE shared_with IS NOT NULL"
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_session_share_org "
        "ON workspace_shares (session_id, org_id) "
        "WHERE shared_with IS NULL"
    )

    # Correction (c): usage_logs_org_id_fkey -> ON DELETE SET NULL.
    op.execute(
        "ALTER TABLE usage_logs DROP CONSTRAINT usage_logs_org_id_fkey"
    )
    op.execute(
        "ALTER TABLE usage_logs ADD CONSTRAINT usage_logs_org_id_fkey "
        "FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE SET NULL"
    )


def downgrade() -> None:
    raise NotImplementedError(
        "B0 is an irreversible squashed baseline. Dropping the 23 tables it "
        "creates would destroy production data with no legitimate use case "
        "for that operation via `alembic downgrade`. Recovery is: (a) if B0 "
        "has not yet committed, the transaction never applied — nothing to "
        "undo; (b) if it has committed, restore from a verified pg_dump via "
        "ops/backup/restore.sh — not a schema-level downgrade. See "
        "docs/ALEMBIC_SCHEMA_RECONCILIATION_STAGE_E2_REV3_2026-08-05.md §10."
    )
