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
    assert isinstance(r.json(), list)


def test_delete_session(client):
    sid = client.post("/api/sessions").json()["session_id"]
    r = client.delete(f"/api/sessions/{sid}")
    assert r.status_code == 200
    assert r.json()["status"] == "deleted"


def test_delete_nonexistent_session_ok(client):
    # session_manager.cleanup_session is idempotent
    r = client.delete("/api/sessions/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 200
