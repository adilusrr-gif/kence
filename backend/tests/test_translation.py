"""Tests for document translation endpoints."""
import pytest
from unittest.mock import patch


FAKE_MARKDOWN = "# Тестовый документ\n\nСодержимое для перевода."


def _session_with_doc(client) -> str:
    sid = client.post("/api/sessions").json()["session_id"]
    from app.core.session import session_manager
    sess = session_manager.get_session(sid)
    sess["vector_store"] = True
    sess["document"] = "test.txt"
    sess["markdown_text"] = FAKE_MARKDOWN
    return sid


def test_translate_no_document(client):
    sid = client.post("/api/sessions").json()["session_id"]
    r = client.post("/api/translate", json={"session_id": sid, "target_language": "kz"})
    assert r.status_code == 400


def test_translate_to_kz(client):
    sid = _session_with_doc(client)
    with patch("app.api.routes.translation_service") as mock_ts:
        mock_ts.translate_document.return_value = "Аударылған мәтін"
        r = client.post("/api/translate", json={"session_id": sid, "target_language": "kz"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["language"] == "kz"
    assert "translated" in body


def test_translate_to_ru(client):
    sid = _session_with_doc(client)
    with patch("app.api.routes.translation_service") as mock_ts:
        mock_ts.translate_document.return_value = "Переведённый текст"
        r = client.post("/api/translate", json={"session_id": sid, "target_language": "ru"})
    assert r.status_code == 200
    assert r.json()["language"] == "ru"


def test_translate_to_en(client):
    sid = _session_with_doc(client)
    with patch("app.api.routes.translation_service") as mock_ts:
        mock_ts.translate_document.return_value = "Translated text"
        r = client.post("/api/translate", json={"session_id": sid, "target_language": "en"})
    assert r.status_code == 200
    assert r.json()["language"] == "en"


def test_translate_invalid_language(client):
    sid = _session_with_doc(client)
    r = client.post("/api/translate", json={"session_id": sid, "target_language": "fr"})
    assert r.status_code == 422


def test_translate_session_not_found(client):
    r = client.post(
        "/api/translate",
        json={"session_id": "00000000-0000-0000-0000-000000000000", "target_language": "en"},
    )
    assert r.status_code == 400
