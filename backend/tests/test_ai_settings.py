"""Tests for per-user AI prompt overrides (personal → global → hardcoded default)."""
import pytest

from app.api.auth_routes import get_current_user, require_admin
from app.main import app

ADMIN_USER = {"username": "admin_test", "role": "admin", "is_active": True}
OTHER_USER = {"username": "otheruser", "role": "user", "is_active": True}


@pytest.fixture
def as_admin():
    """Temporarily overrides get_current_user/require_admin so requests act as an admin."""
    app.dependency_overrides[get_current_user] = lambda: ADMIN_USER
    app.dependency_overrides[require_admin] = lambda: ADMIN_USER
    yield ADMIN_USER
    # Restore the default (non-admin) overrides set up in conftest.py
    from tests.conftest import _override_current_user
    app.dependency_overrides[get_current_user] = _override_current_user
    app.dependency_overrides.pop(require_admin, None)


def test_default_prompts_are_global_not_personal(client):
    r = client.get("/api/ai-settings/prompts")
    assert r.status_code == 200
    body = r.json()
    assert body["scope"] == "user"
    assert body["prompts"]["chat_prompt"]["is_personal"] is False


def test_user_can_set_personal_override_without_admin(client):
    r = client.put("/api/ai-settings/prompts/chat_prompt", json={"content": "My personal chat prompt {context} {question}"})
    assert r.status_code == 200, r.text
    assert r.json()["scope"] == "user"

    r = client.get("/api/ai-settings/prompts")
    entry = r.json()["prompts"]["chat_prompt"]
    assert entry["is_personal"] is True
    assert entry["content"] == "My personal chat prompt {context} {question}"

    # Cleanup so later tests see a clean slate.
    client.post("/api/ai-settings/prompts/chat_prompt/reset")


def test_personal_override_does_not_leak_to_other_users(client, as_admin):
    # testuser (default conftest identity) sets a personal override.
    from tests.conftest import _override_current_user
    app.dependency_overrides[get_current_user] = _override_current_user
    r = client.put("/api/ai-settings/prompts/comparison_semantic_prompt", json={"content": "testuser-only prompt"})
    assert r.status_code == 200

    # A different user's personal view must not see it.
    app.dependency_overrides[get_current_user] = lambda: OTHER_USER
    r = client.get("/api/ai-settings/prompts")
    entry = r.json()["prompts"]["comparison_semantic_prompt"]
    assert entry["is_personal"] is False
    assert entry["content"] != "testuser-only prompt"

    # Cleanup.
    app.dependency_overrides[get_current_user] = _override_current_user
    client.post("/api/ai-settings/prompts/comparison_semantic_prompt/reset")


def test_non_admin_cannot_write_global_scope(client):
    r = client.put(
        "/api/ai-settings/prompts/chat_prompt",
        json={"content": "hijack global"},
        params={"scope": "global"},
    )
    assert r.status_code == 403


def test_non_admin_cannot_read_global_scope(client):
    r = client.get("/api/ai-settings/prompts", params={"scope": "global"})
    assert r.status_code == 403


def test_admin_can_write_global_scope_and_users_inherit_it(client, as_admin):
    r = client.put(
        "/api/ai-settings/prompts/comparison_technical_prompt",
        json={"content": "New global technical prompt {text}"},
        params={"scope": "global"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["scope"] == "global"

    # A user with no personal override inherits the new global default.
    app.dependency_overrides[get_current_user] = lambda: OTHER_USER
    r = client.get("/api/ai-settings/prompts")
    entry = r.json()["prompts"]["comparison_technical_prompt"]
    assert entry["content"] == "New global technical prompt {text}"
    assert entry["is_personal"] is False

    # Cleanup — restore the hardcoded default globally.
    app.dependency_overrides[get_current_user] = lambda: ADMIN_USER
    client.post("/api/ai-settings/prompts/comparison_technical_prompt/reset", params={"scope": "global"})
    from tests.conftest import _override_current_user
    app.dependency_overrides[get_current_user] = _override_current_user


def test_personal_reset_reverts_to_global_default(client):
    original = client.get("/api/ai-settings/prompts").json()["prompts"]["exact_prompt"]["content"]
    client.put("/api/ai-settings/prompts/exact_prompt", json={"content": "temporary override"})
    r = client.post("/api/ai-settings/prompts/exact_prompt/reset")
    assert r.status_code == 200
    assert r.json()["content"] == original
    assert r.json()["scope"] == "user"

    r = client.get("/api/ai-settings/prompts")
    assert r.json()["prompts"]["exact_prompt"]["is_personal"] is False


def test_unknown_prompt_type_rejected(client):
    r = client.put("/api/ai-settings/prompts/not_a_real_prompt", json={"content": "x"})
    assert r.status_code == 404
