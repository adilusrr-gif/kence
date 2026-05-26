"""Tests for RAG chat and streaming endpoints."""
import io
import pytest
from unittest.mock import patch, MagicMock, AsyncMock


FAKE_MARKDOWN = "# Doc\n\nSome content."
FAKE_HTML = "<p>Some content.</p>"


def _make_session_with_doc(client) -> str:
    """Creates a session and marks it as having a document (vector_store=True)."""
    sid = client.post("/api/sessions").json()["session_id"]
    # Inject doc state directly via the in-memory session manager
    from app.core.session import session_manager
    sess = session_manager.get_session(sid)
    sess["vector_store"] = True
    sess["document"] = "test.txt"
    sess["markdown_text"] = FAKE_MARKDOWN
    sess["html_text"] = FAKE_HTML
    return sid


def test_chat_no_document(client):
    sid = client.post("/api/sessions").json()["session_id"]
    r = client.post("/api/chat", json={"session_id": sid, "question": "Hello?"})
    assert r.status_code == 400
    assert "No document" in r.json()["detail"]


def test_chat_with_document(client):
    sid = _make_session_with_doc(client)
    with patch("app.api.routes.llm_service") as mock_llm:
        mock_llm.chat.return_value = "Test answer from LLM"
        r = client.post("/api/chat", json={"session_id": sid, "question": "What is this?"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["answer"] == "Test answer from LLM"
    assert body["session_id"] == sid


def test_chat_missing_fields(client):
    r = client.post("/api/chat", json={"session_id": "x"})
    assert r.status_code == 422


def test_get_document_content(client):
    sid = _make_session_with_doc(client)
    r = client.get(f"/api/documents/{sid}/content")
    assert r.status_code == 200
    body = r.json()
    assert body["filename"] == "test.txt"
    assert body["markdown"] == FAKE_MARKDOWN


def test_get_document_content_missing_session(client):
    r = client.get("/api/documents/00000000-0000-0000-0000-000000000000/content")
    assert r.status_code == 404


def test_chat_stream_no_document(client):
    sid = client.post("/api/sessions").json()["session_id"]
    with client.stream("GET", f"/api/chat/stream?session_id={sid}&question=hello") as r:
        assert r.status_code == 400


def test_chat_stream_with_document(client):
    sid = _make_session_with_doc(client)

    async def fake_astream(*args, **kwargs):
        for chunk in ["Hello", " world"]:
            yield chunk

    with patch("app.api.routes.llm_service") as mock_llm:
        mock_llm.chat_astream = fake_astream
        with client.stream(
            "GET",
            f"/api/chat/stream?session_id={sid}&question=hello",
        ) as r:
            assert r.status_code == 200
            content = r.read().decode()
    assert "data:" in content
