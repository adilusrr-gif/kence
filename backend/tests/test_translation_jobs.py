"""Tests for background translation jobs + multi-format downloads (PART 2/3)."""
import time

import pytest
from unittest.mock import patch

FAKE_MARKDOWN = (
    "# Документ\n\n## Статья 1\n\n1. Первый пункт.\n2. Второй пункт.\n\n"
    "## Статья 2\n\nЗаключение."
)


def _session_with_doc(client) -> str:
    sid = client.post("/api/sessions").json()["session_id"]
    from app.core.session import session_manager
    sess = session_manager.get_session(sid)
    sess["vector_store"] = True
    sess["document"] = "test.txt"
    sess["markdown_text"] = FAKE_MARKDOWN
    return sid


# ── API: create / list / get ─────────────────────────────────────────────────

def test_create_translation_job_queued(client):
    sid = _session_with_doc(client)
    r = client.post("/api/translations", json={"session_id": sid, "target_language": "en"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "queued"
    assert body["target_language"] == "en"
    assert body["source_chars"] == len(FAKE_MARKDOWN)
    assert body["total_chunks"] >= 1
    assert isinstance(body["id"], int)


def test_create_translation_no_document(client):
    sid = client.post("/api/sessions").json()["session_id"]
    r = client.post("/api/translations", json={"session_id": sid, "target_language": "en"})
    assert r.status_code in (400, 404)


def test_create_translation_bad_language(client):
    sid = _session_with_doc(client)
    r = client.post("/api/translations", json={"session_id": sid, "target_language": "zz"})
    assert r.status_code == 400


def test_list_translation_history(client):
    sid = _session_with_doc(client)
    client.post("/api/translations", json={"session_id": sid, "target_language": "kz"})
    r = client.get("/api/translations")
    assert r.status_code == 200
    jobs = r.json()
    assert isinstance(jobs, list) and len(jobs) >= 1
    assert all("status" in j and "progress" in j for j in jobs)


def test_get_translation_status(client):
    sid = _session_with_doc(client)
    job_id = client.post("/api/translations", json={"session_id": sid, "target_language": "ru"}).json()["id"]
    r = client.get(f"/api/translations/{job_id}")
    assert r.status_code == 200
    assert r.json()["id"] == job_id


def test_get_translation_not_found(client):
    r = client.get("/api/translations/99999999")
    assert r.status_code == 404


def test_delete_translation(client):
    sid = _session_with_doc(client)
    job_id = client.post("/api/translations", json={"session_id": sid, "target_language": "kz"}).json()["id"]
    r = client.delete(f"/api/translations/{job_id}")
    assert r.status_code == 200
    assert client.get(f"/api/translations/{job_id}").status_code == 404


# ── Download ─────────────────────────────────────────────────────────────────

def _complete_job(job_id: int, translated: str):
    from app.core.database import SessionLocal
    from app.models.models import TranslationJob
    with SessionLocal() as db:
        job = db.get(TranslationJob, job_id)
        job.status = "completed"
        job.translated_text = translated
        job.progress = 100
        db.commit()


def test_download_requires_completed(client):
    sid = _session_with_doc(client)
    job_id = client.post("/api/translations", json={"session_id": sid, "target_language": "en"}).json()["id"]
    # Force back to queued (worker may have touched it) and ensure no result yet.
    from app.core.database import SessionLocal
    from app.models.models import TranslationJob
    with SessionLocal() as db:
        job = db.get(TranslationJob, job_id)
        job.status = "queued"
        job.translated_text = None
        db.commit()
    r = client.get(f"/api/translations/{job_id}/download/md")
    assert r.status_code == 409


@pytest.mark.parametrize("fmt,needle", [
    ("md", "# Translated"),
    ("txt", "Translated"),
    ("html", "<h1>Translated"),
])
def test_download_formats(client, fmt, needle):
    sid = _session_with_doc(client)
    job_id = client.post("/api/translations", json={"session_id": sid, "target_language": "en"}).json()["id"]
    _complete_job(job_id, "# Translated\n\n1. one\n2. two\n")
    r = client.get(f"/api/translations/{job_id}/download/{fmt}")
    assert r.status_code == 200, r.text
    assert needle in r.text


def test_download_bad_format(client):
    sid = _session_with_doc(client)
    job_id = client.post("/api/translations", json={"session_id": sid, "target_language": "en"}).json()["id"]
    _complete_job(job_id, "# X")
    r = client.get(f"/api/translations/{job_id}/download/exe")
    assert r.status_code == 400


# ── Worker helpers (deterministic, no Ollama) ────────────────────────────────

def _new_job(target="en", status="queued", source="# A\n\ntext"):
    from app.core.database import SessionLocal
    from app.models.models import TranslationJob
    with SessionLocal() as db:
        job = TranslationJob(
            username="testuser", target_language=target, status=status,
            source_text=source, source_chars=len(source), total_chunks=1,
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        return job.id


def test_requeue_interrupted_jobs(client):
    from app.services import translation_worker
    from app.core.database import SessionLocal
    from app.models.models import TranslationJob
    jid = _new_job(status="processing")
    translation_worker.requeue_interrupted_jobs()
    with SessionLocal() as db:
        assert db.get(TranslationJob, jid).status == "queued"


def test_handle_failure_retries_then_fails(client):
    from app.services import translation_worker
    from app.core.database import SessionLocal
    from app.models.models import TranslationJob
    jid = _new_job(status="processing")
    with SessionLocal() as db:
        db.get(TranslationJob, jid).max_retries = 1
        db.commit()
    assert translation_worker._handle_failure(jid, "boom") is True   # retry 1
    with SessionLocal() as db:
        assert db.get(TranslationJob, jid).status == "queued"
        db.get(TranslationJob, jid).status = "processing"
        db.commit()
    assert translation_worker._handle_failure(jid, "boom") is False  # exhausted
    with SessionLocal() as db:
        assert db.get(TranslationJob, jid).status == "failed"


def test_process_job_completes_with_mock(client):
    from app.services import translation_worker
    from app.core.database import SessionLocal
    from app.models.models import TranslationJob
    import asyncio

    jid = _new_job(status="processing", source="# Doc\n\nHello")

    async def fake_tracked(text, lang, progress_cb=None):
        if progress_cb:
            await progress_cb(1, 1)
        return "# Doc\n\nПривет"

    with patch("app.services.translation.translation_service.translate_document_tracked",
               side_effect=fake_tracked):
        asyncio.run(translation_worker._process_job(jid))

    with SessionLocal() as db:
        job = db.get(TranslationJob, jid)
        assert job.status == "completed"
        assert job.progress == 100
        assert "Привет" in job.translated_text
