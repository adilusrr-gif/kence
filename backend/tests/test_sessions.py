"""Tests for session lifecycle endpoints."""
import pytest


def test_create_session(client):
    r = client.post("/api/sessions")
    assert r.status_code == 200
    body = r.json()
    assert "session_id" in body
    assert body["status"] == "created"


def test_create_session_returns_valid_uuid(client):
    import uuid
    r = client.post("/api/sessions")
    assert r.status_code == 200
    sid = r.json()["session_id"]
    uuid.UUID(sid)  # raises if invalid


def test_list_sessions_returns_list(client):
    r = client.get("/api/sessions")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["sessions"], list)
    assert {"total", "offset", "limit", "sessions"} <= body.keys()


def test_delete_session(client):
    sid = client.post("/api/sessions").json()["session_id"]
    r = client.delete(f"/api/sessions/{sid}")
    assert r.status_code == 200
    assert r.json()["status"] == "deleted"


def test_delete_nonexistent_session_ok(client):
    # session_manager.cleanup_session is idempotent
    r = client.delete("/api/sessions/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 200


def test_html_preview_stored_on_disk_not_in_memory(client):
    """store_html() must persist to uploads/{session_id}/preview.html and NOT
    keep the (potentially multi-MB) blob in the in-memory session dict."""
    from app.core.session import session_manager
    sid = client.post("/api/sessions").json()["session_id"]

    session_manager.store_html(sid, "<p>hello preview</p>")
    data = session_manager.get_session(sid)
    assert "html_text" not in data
    assert data.get("html_path")

    loaded = session_manager.load_html(sid)
    assert loaded == "<p>hello preview</p>"


def test_html_preview_oversized_is_dropped(client):
    from app.core.session import session_manager
    sid = client.post("/api/sessions").json()["session_id"]

    session_manager.store_html(sid, "x" * 20_000_000)  # above the 15 MB cap
    data = session_manager.get_session(sid)
    assert data.get("html_path") is None
    assert session_manager.load_html(sid) == ""
