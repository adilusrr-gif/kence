"""Tests for document comparison endpoints."""
import io
import pytest
from unittest.mock import patch


def _make_session(client) -> str:
    return client.post("/api/sessions").json()["session_id"]


def _upload_two(client, sid: str):
    return client.post(
        f"/api/compare/upload?session_id={sid}",
        files={
            "file1": ("doc1.txt", io.BytesIO(b"Document one content."), "text/plain"),
            "file2": ("doc2.txt", io.BytesIO(b"Document two content."), "text/plain"),
        },
    )


def test_upload_comparison_docs(client):
    sid = _make_session(client)
    r = _upload_two(client, sid)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["doc1"] == "doc1.txt"
    assert body["doc2"] == "doc2.txt"


def test_upload_session_not_found(client):
    r = client.post(
        "/api/compare/upload?session_id=00000000-0000-0000-0000-000000000000",
        files={
            "file1": ("a.txt", io.BytesIO(b"a"), "text/plain"),
            "file2": ("b.txt", io.BytesIO(b"b"), "text/plain"),
        },
    )
    assert r.status_code == 404


def test_upload_disallowed_extension(client):
    sid = _make_session(client)
    r = client.post(
        f"/api/compare/upload?session_id={sid}",
        files={
            "file1": ("doc.exe", io.BytesIO(b"bad"), "application/octet-stream"),
            "file2": ("doc.txt", io.BytesIO(b"ok"), "text/plain"),
        },
    )
    assert r.status_code == 400


def test_compare_without_docs(client):
    sid = _make_session(client)
    r = client.post(f"/api/compare/semantic?session_id={sid}")
    assert r.status_code == 400
    assert "Upload two documents" in r.json()["detail"]


def test_compare_semantic(client):
    sid = _make_session(client)
    _upload_two(client, sid)
    fake_result = {"similarity": 0.85, "common_themes": ["AI"], "differences": []}
    with patch("app.api.comparison_routes.comparator") as mock_cmp:
        mock_cmp.compare_semantic.return_value = fake_result
        r = client.post(f"/api/compare/semantic?session_id={sid}")
    assert r.status_code == 200, r.text
    assert r.json()["similarity"] == 0.85


def test_compare_technical(client):
    sid = _make_session(client)
    _upload_two(client, sid)
    fake_result = {"matches": [], "differences": ["structure"]}
    with patch("app.api.comparison_routes.comparator") as mock_cmp:
        mock_cmp.compare_technical_specs.return_value = fake_result
        r = client.post(f"/api/compare/technical?session_id={sid}")
    assert r.status_code == 200, r.text


def test_comparison_status(client):
    sid = _make_session(client)
    r = client.get(f"/api/compare/status/{sid}")
    assert r.status_code == 200
    assert r.json()["has_comparison_docs"] is False

    _upload_two(client, sid)
    r = client.get(f"/api/compare/status/{sid}")
    assert r.json()["has_comparison_docs"] is True
