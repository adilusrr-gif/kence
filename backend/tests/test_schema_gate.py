"""The manifest schema gate must fail CLOSED.

_init_db wraps startup in a broad `except Exception` so the app can degrade to
"running without persistent DB" when Postgres is unreachable. That handler used
to swallow schema-verification failures too, which meant the gate documented in
docs/ALEMBIC_SCHEMA_RECONCILIATION_STAGE_E3_IMPLEMENTATION_2026-08-05.md
("refuses to start against an unexpected schema") logged a warning and served
traffic anyway. These tests pin both halves of the split.
"""
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy.exc import OperationalError, ProgrammingError

from app.main import SchemaVerificationError, _init_db


def _pg_engine():
    engine = MagicMock()
    engine.url.get_backend_name.return_value = "postgresql"
    return engine


def test_schema_verification_failure_aborts_startup():
    with patch("app.core.database.engine", _pg_engine()), \
         patch("app.main._verify_schema_at_expected_revision",
               side_effect=SchemaVerificationError("alembic_version table does not exist")):
        with pytest.raises(SchemaVerificationError):
            _init_db()


def test_unreachable_database_still_degrades_instead_of_aborting():
    err = OperationalError("SELECT 1", {}, Exception("could not connect"))
    with patch("app.core.database.engine", _pg_engine()), \
         patch("app.main._verify_schema_at_expected_revision", side_effect=err):
        _init_db()  # must not raise — degrade-to-no-DB path is still intact


def test_missing_alembic_version_table_is_a_schema_failure_not_a_connection_failure():
    """The exact case seen in production: the table is absent, psycopg2 raises
    UndefinedTable (a ProgrammingError), and that must abort rather than warn."""
    engine = _pg_engine()
    conn = engine.connect.return_value.__enter__.return_value
    conn.execute.side_effect = ProgrammingError(
        "SELECT version_num FROM alembic_version", {}, Exception("UndefinedTable")
    )

    from app.main import _verify_schema_at_expected_revision

    with patch("app.core.database.engine", engine):
        with pytest.raises(SchemaVerificationError, match="alembic_version"):
            _verify_schema_at_expected_revision()
