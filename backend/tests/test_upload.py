"""
Tests for document upload endpoint.
doc_processor.process_file is mocked to avoid Docling/Chroma calls.
"""
import io
import pytest
from unittest.mock import patch, MagicMock


FAKE_MARKDOWN = "# Test Document\n\nSome content here."
FAKE_HTML = "<h1>Test Document</h1><p>Some content here.</p>"

_GOOD_MIME = (True, "text/plain")
_BAD_MIME  = (False, "application/x-executable")


def _make_session(client) -> str:
    return client.post("/api/sessions").json()["session_id"]


def _upload(client, session_id: str, content: bytes, filename: str):
    return client.post(
        f"/api/documents/upload?session_id={session_id}",
        files={"file": (filename, io.BytesIO(content), "application/octet-stream")},
    )


@pytest.fixture(autouse=True)
def mock_processor():
    with patch("app.api.routes.doc_processor") as m:
        m.process_file.return_value = (MagicMock(), FAKE_MARKDOWN, FAKE_HTML)
        yield m


def test_upload_txt_success(client):
    with patch("app.api.routes.validate_mime", return_value=_GOOD_MIME):
        sid = _make_session(client)
        r = _upload(client, sid, b"Hello document content", "test.txt")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "processed"
    assert body["filename"] == "test.txt"
    assert body["session_id"] == sid


def test_upload_invalid_session(client):
    with patch("app.api.routes.validate_mime", return_value=_GOOD_MIME):
        r = _upload(client, "not-a-uuid", b"content", "test.txt")
    assert r.status_code == 400


def test_upload_session_not_found(client):
    with patch("app.api.routes.validate_mime", return_value=_GOOD_MIME):
        r = _upload(client, "00000000-0000-0000-0000-000000000000", b"content", "test.txt")
    assert r.status_code == 404


def test_upload_disallowed_extension(client):
    # Extension check happens before MIME check — no mime mock needed
    sid = _make_session(client)
    r = _upload(client, sid, b"content", "test.exe")
    assert r.status_code == 400
    assert "Allowed formats" in r.json()["detail"]


def test_upload_mime_mismatch(client):
    with patch("app.api.routes.validate_mime", return_value=_BAD_MIME):
        sid = _make_session(client)
        r = _upload(client, sid, b"MZ\x90\x00this is an exe", "test.pdf")
    assert r.status_code == 415
    assert "content does not match" in r.json()["detail"]


def test_upload_stores_preview(client):
    with patch("app.api.routes.validate_mime", return_value=_GOOD_MIME):
        sid = _make_session(client)
        r = _upload(client, sid, b"Hello document content", "test.txt")
    assert r.status_code == 200
    assert len(r.json()["preview"]) > 0


def test_upload_char_count(client):
    with patch("app.api.routes.validate_mime", return_value=_GOOD_MIME):
        sid = _make_session(client)
        r = _upload(client, sid, b"Hello document content", "test.txt")
    assert r.status_code == 200
    assert r.json()["char_count"] == len(FAKE_MARKDOWN)


def test_upload_html_preview_stored_on_disk_and_readable(client):
    """The HTML preview is no longer kept in RAM/Postgres (see
    session_manager.store_html) — it's written to uploads/{session_id}/preview.html
    and must round-trip through GET /documents/{sid}/content."""
    from pathlib import Path
    from app.core.config import get_settings

    with patch("app.api.routes.validate_mime", return_value=_GOOD_MIME):
        sid = _make_session(client)
        r = _upload(client, sid, b"Hello document content", "test.txt")
    assert r.status_code == 200

    html_path = Path(get_settings().UPLOAD_DIR) / sid / "preview.html"
    assert html_path.exists()
    assert html_path.read_text(encoding="utf-8") == FAKE_HTML

    content = client.get(f"/api/documents/{sid}/content")
    assert content.status_code == 200
    assert content.json()["html"] == FAKE_HTML
