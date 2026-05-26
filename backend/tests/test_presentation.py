"""Tests for presentation plan and build endpoints."""
import pytest
from unittest.mock import patch, MagicMock


FAKE_PLAN = {
    "title": "Test Presentation",
    "slides": [
        {"id": "s1", "type": "title", "title": "Intro", "content": "Intro content"},
        {"id": "s2", "type": "content", "title": "Body", "content": "Body content"},
    ],
}


def _session_with_doc(client) -> str:
    sid = client.post("/api/sessions").json()["session_id"]
    from app.core.session import session_manager
    sess = session_manager.get_session(sid)
    sess["vector_store"] = True
    sess["document"] = "test.pdf"
    sess["markdown_text"] = "# Report\n\nThis is test content for the presentation."
    return sid


def test_get_themes(client):
    r = client.get("/api/presentations/themes")
    assert r.status_code == 200
    body = r.json()
    assert "themes" in body
    assert "slide_types" in body


def test_create_plan_no_document(client):
    sid = client.post("/api/sessions").json()["session_id"]
    r = client.post("/api/presentations/plan", json={"session_id": sid})
    assert r.status_code == 400
    assert "No document" in r.json()["detail"]


def test_create_plan_success(client):
    sid = _session_with_doc(client)
    with patch("app.api.presentation_routes.generate_plan", return_value=FAKE_PLAN):
        r = client.post(
            "/api/presentations/plan",
            json={"session_id": sid, "num_slides": 2, "user_instructions": ""},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["title"] == "Test Presentation"
    assert len(body["slides"]) == 2


def test_update_plan(client):
    sid = _session_with_doc(client)
    with patch("app.api.presentation_routes.generate_plan", return_value=FAKE_PLAN):
        client.post("/api/presentations/plan", json={"session_id": sid})

    updated_slides = [{"id": "s1", "title": "Updated", "content": "New content"}]
    r = client.put(
        f"/api/presentations/plan?session_id={sid}",
        json={"slides": updated_slides, "title": "Updated Title"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "Updated Title"


def test_build_no_plan(client):
    sid = _session_with_doc(client)
    r = client.post(
        f"/api/presentations/build?session_id={sid}",
        json={"theme": "corporate", "slide_ids": ["s1"]},
    )
    assert r.status_code == 400
    assert "No plan" in r.json()["detail"]


def test_build_success(client):
    sid = _session_with_doc(client)
    fake_path = MagicMock()
    # generate_plan mocked so it doesn't hit Ollama;
    # get_plan mocked so build sees the saved plan without needing real file I/O.
    with patch("app.api.presentation_routes.generate_plan", return_value=FAKE_PLAN), \
         patch("app.api.presentation_routes.get_plan", return_value=FAKE_PLAN), \
         patch("app.api.presentation_routes.build_presentation", return_value=fake_path):
        client.post("/api/presentations/plan", json={"session_id": sid})
        r = client.post(
            f"/api/presentations/build?session_id={sid}",
            json={"theme": "corporate", "slide_ids": ["s1", "s2"]},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "built"
    assert "download_url" in body


def test_download_not_found(client):
    sid = client.post("/api/sessions").json()["session_id"]
    r = client.get(f"/api/presentations/download/{sid}")
    assert r.status_code == 404
