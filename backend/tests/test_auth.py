"""
Tests for authentication endpoints.
The default admin (admin / kence2026!) is created in the lifespan hook.
"""
import pytest


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_login_success(client):
    r = client.post(
        "/api/auth/login",
        data={"username": "admin", "password": "kence2026!"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "access_token" in body
    assert body["username"] == "admin"
    assert body["role"] == "admin"


def test_login_wrong_password(client):
    r = client.post(
        "/api/auth/login",
        data={"username": "admin", "password": "wrongpassword"},
    )
    assert r.status_code == 401


def test_login_nonexistent_user(client):
    r = client.post(
        "/api/auth/login",
        data={"username": "nobody", "password": "nopass"},
    )
    assert r.status_code == 401


def test_register_new_user(client):
    import uuid
    username = f"reg_{uuid.uuid4().hex[:8]}"
    r = client.post(
        "/api/auth/register",
        json={"username": username, "password": "testpass123"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["username"] == username
    assert "access_token" in body


def test_register_duplicate_user(client):
    import uuid
    username = f"dup_{uuid.uuid4().hex[:8]}"
    client.post(
        "/api/auth/register",
        json={"username": username, "password": "testpass123"},
    )
    r = client.post(
        "/api/auth/register",
        json={"username": username, "password": "testpass123"},
    )
    assert r.status_code == 400


def test_register_username_too_short(client):
    r = client.post(
        "/api/auth/register",
        json={"username": "ab", "password": "testpass123"},
    )
    assert r.status_code == 422


def test_register_password_too_short(client):
    r = client.post(
        "/api/auth/register",
        json={"username": "validuser", "password": "123"},
    )
    assert r.status_code == 422


def test_me_endpoint(client):
    # Uses dependency override — returns FAKE_USER
    r = client.get("/api/auth/me")
    assert r.status_code == 200
    body = r.json()
    assert body["username"] == "testuser"
    assert body["role"] == "user"
    assert body["is_active"] is True
