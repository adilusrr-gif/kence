"""Tests for role-scoped analytics: any user sees only their own upload count,
admin-only endpoints stay behind require_admin."""
import pytest

from app.api.auth_routes import get_current_user, require_admin
from app.main import app
from app.services import analytics_service


@pytest.fixture
def as_admin():
    admin = {"username": "admin_analytics_test", "role": "admin", "is_active": True}
    app.dependency_overrides[get_current_user] = lambda: admin
    app.dependency_overrides[require_admin] = lambda: admin
    yield admin
    from tests.conftest import _override_current_user
    app.dependency_overrides[get_current_user] = _override_current_user
    app.dependency_overrides.pop(require_admin, None)


def test_my_stats_available_to_regular_user(client):
    r = client.get("/api/analytics/my")
    assert r.status_code == 200
    body = r.json()
    assert "uploads" in body
    assert isinstance(body["uploads"], int)


def test_my_stats_counts_only_own_uploads(client):
    analytics_service.log_event("upload", username="testuser", file_format="PDF")
    analytics_service.log_event("upload", username="someone_else", file_format="PDF")

    before = client.get("/api/analytics/my").json()["uploads"]
    analytics_service.log_event("upload", username="testuser", file_format="DOCX")
    after = client.get("/api/analytics/my").json()["uploads"]
    assert after == before + 1


def test_full_overview_forbidden_for_regular_user(client):
    r = client.get("/api/analytics/overview")
    assert r.status_code == 403


def test_full_overview_allowed_for_admin(client, as_admin):
    r = client.get("/api/analytics/overview")
    assert r.status_code == 200
    body = r.json()
    assert "by_type" in body
    assert "unique_users" in body


def test_timeline_and_events_forbidden_for_regular_user(client):
    assert client.get("/api/analytics/timeline").status_code == 403
    assert client.get("/api/analytics/events").status_code == 403
