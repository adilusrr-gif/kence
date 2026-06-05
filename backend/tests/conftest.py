"""
Test fixtures. DATABASE_URL must be set to SQLite BEFORE any app import
so SQLAlchemy uses the test DB instead of PostgreSQL.

_migrate_users_from_json uses pg_insert (PostgreSQL-specific), but it's
wrapped in try/except inside _init_db, so it silently skips on SQLite.
"""
import os
import io
import pathlib
import pytest

# ── Always start with a fresh DB so stale schemas don't break the suite ───────
_TEST_DB = pathlib.Path(__file__).parent.parent / "test_docai.db"
_TEST_DB.unlink(missing_ok=True)

# ── SQLite override — must come before any app import ─────────────────────────
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_docai.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-ci")
os.environ.setdefault("OLLAMA_BASE_URL", "http://localhost:11434")
os.environ.setdefault("LLM_MODEL", "llama3.2")
os.environ.setdefault("UPLOAD_DIR", "/tmp/docai_test_uploads")
os.environ.setdefault("CHROMA_PATH", "/tmp/docai_test_chroma")
os.environ.setdefault("ADMIN_INITIAL_PASSWORD", "kence2026!")

from unittest.mock import MagicMock, patch, AsyncMock

from fastapi.testclient import TestClient

from app.main import app
from app.api.auth_routes import get_current_user

# ── Fake user returned by all authenticated endpoints ─────────────────────────
FAKE_USER = {"username": "testuser", "role": "user", "is_active": True}


def _override_current_user():
    return FAKE_USER


app.dependency_overrides[get_current_user] = _override_current_user


# ── TestClient (synchronous, handles lifespan) ────────────────────────────────
@pytest.fixture(scope="session")
def client():
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


# ── Helpers ───────────────────────────────────────────────────────────────────
@pytest.fixture
def auth_headers():
    """Placeholder — dependency override makes these unnecessary, but kept for
    tests that call the real login endpoint."""
    return {}


def make_upload_file(content: bytes = b"%PDF-1.4 fake pdf", filename: str = "test.pdf"):
    return ("file", (filename, io.BytesIO(content), "application/octet-stream"))


@pytest.fixture
def pdf_upload():
    return make_upload_file(b"%PDF-1.4 fake", "test.pdf")


@pytest.fixture
def txt_upload():
    return make_upload_file(b"Hello world document text", "test.txt")
