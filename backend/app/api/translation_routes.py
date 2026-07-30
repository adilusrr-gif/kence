"""Background translation API (PART 2 + PART 3 downloads).

Endpoints
---------
POST   /api/translations                      create an async translation job
GET    /api/translations                      current user's translation history
GET    /api/translations/{id}                 job status + progress
DELETE /api/translations/{id}                  delete a job
GET    /api/translations/{id}/download/{fmt}   download result (pdf|docx|txt|md|html)

Jobs run on the background worker (app/services/translation_worker.py) so the
user can keep chatting while a document translates, and the job survives both a
browser refresh and a backend restart.
"""
import asyncio
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.api.auth_routes import get_current_user
from app.core.config import get_settings
from app.core.database import SessionLocal
from app.core.limiter import limiter
from app.core.session import session_manager
from app.models.models import TranslationJob
from app.services.translation import translation_service, LANGUAGE_NAMES

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/translations", tags=["translations"])

DOWNLOAD_FORMATS = {"pdf", "docx", "txt", "md", "html"}


class CreateTranslationRequest(BaseModel):
    session_id: str
    target_language: str
    source_language: Optional[str] = None


def _resolve_org_id(username: str) -> Optional[int]:
    try:
        from app.services.org_service import get_user_orgs
        orgs = get_user_orgs(username)
        return orgs[0]["id"] if orgs else None
    except Exception:
        return None


def _job_to_dict(job: TranslationJob, include_text: bool = False) -> dict:
    d = {
        "id": job.id,
        "session_id": job.session_id,
        "document_name": job.document_name,
        "source_language": job.source_language,
        "target_language": job.target_language,
        "status": job.status,
        "progress": job.progress,
        "total_chunks": job.total_chunks,
        "done_chunks": job.done_chunks,
        "source_chars": job.source_chars,
        "retry_count": job.retry_count,
        "error": job.error,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
    }
    if include_text:
        d["translated_text"] = job.translated_text
    return d


@router.post("")
@limiter.limit("20/minute")
async def create_translation(
    request: Request,
    body: CreateTranslationRequest,
    user: dict = Depends(get_current_user),
):
    if body.target_language not in LANGUAGE_NAMES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported language: {body.target_language}. Use: {', '.join(LANGUAGE_NAMES)}",
        )

    session = session_manager.get_session(body.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Access check (mirror the rest of the app's session guard).
    from app.api.routes import _verify_session_access
    _verify_session_access(body.session_id, session, user)

    source_text = (session.get("markdown_text") or "").strip()
    if not source_text:
        raise HTTPException(status_code=400, detail="Document text not found, please re-upload")

    username = user.get("username")
    org_id = session.get("org_id") or _resolve_org_id(username)
    total_chunks = translation_service.count_chunks(source_text)

    with SessionLocal() as db:
        job = TranslationJob(
            org_id=org_id,
            username=username,
            session_id=body.session_id,
            document_name=session.get("document"),
            source_language=body.source_language,
            target_language=body.target_language,
            status="queued",
            source_text=source_text,
            source_chars=len(source_text),
            total_chunks=total_chunks,
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        result = _job_to_dict(job)

    # Analytics (best-effort, non-blocking).
    try:
        from app.services import analytics_service
        asyncio.create_task(asyncio.to_thread(
            analytics_service.log_event, "translation_job",
            username=username, session_id=body.session_id,
            language=body.target_language, org_id=org_id,
        ))
    except Exception:
        pass

    return result


@router.get("")
async def list_translations(
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user),
):
    with SessionLocal() as db:
        jobs = (
            db.query(TranslationJob)
            .filter(TranslationJob.username == user.get("username"))
            .order_by(TranslationJob.created_at.desc())
            .limit(limit)
            .all()
        )
        return [_job_to_dict(j) for j in jobs]


def _get_owned_job(db, job_id: int, user: dict) -> TranslationJob:
    job = db.get(TranslationJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Translation job not found")
    if job.username != user.get("username") and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    return job


@router.get("/{job_id}")
async def get_translation(job_id: int, user: dict = Depends(get_current_user)):
    with SessionLocal() as db:
        job = _get_owned_job(db, job_id, user)
        # Include the translated text only when finished, to keep status polling light.
        return _job_to_dict(job, include_text=(job.status == "completed"))


@router.delete("/{job_id}")
async def delete_translation(job_id: int, user: dict = Depends(get_current_user)):
    with SessionLocal() as db:
        job = _get_owned_job(db, job_id, user)
        db.delete(job)
        db.commit()
    # Clean up any generated download files.
    out_dir = Path(settings.UPLOAD_DIR) / "translations" / str(job_id)
    if out_dir.exists():
        import shutil
        shutil.rmtree(out_dir, ignore_errors=True)
    return {"status": "deleted", "id": job_id}


@router.get("/{job_id}/download/{fmt}")
@limiter.limit("30/minute")
async def download_translation(
    request: Request,
    job_id: int,
    fmt: str,
    user: dict = Depends(get_current_user),
):
    if fmt not in DOWNLOAD_FORMATS:
        raise HTTPException(status_code=400, detail=f"Unsupported format. Use: {', '.join(sorted(DOWNLOAD_FORMATS))}")

    with SessionLocal() as db:
        job = _get_owned_job(db, job_id, user)
        if job.status != "completed" or not job.translated_text:
            raise HTTPException(status_code=409, detail="Translation not completed yet")
        translated_text = job.translated_text
        doc_name = job.document_name or f"document_{job_id}"
        target_language = job.target_language

    from app.services.converter import converter_service

    out_dir = Path(settings.UPLOAD_DIR) / "translations" / str(job_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"translated_{target_language}{converter_service.FORMAT_EXTENSIONS[fmt]}"

    # Generate on demand (idempotent — regenerate if missing).
    if not out_path.exists():
        await asyncio.to_thread(
            converter_service.text_to_format,
            translated_text, out_path, fmt,
            title=f"{Path(doc_name).stem} ({target_language})",
        )

    base = Path(doc_name).stem
    download_name = f"{base}_{target_language}{converter_service.FORMAT_EXTENSIONS[fmt]}"
    return FileResponse(
        str(out_path),
        filename=download_name,
        media_type=converter_service.MEDIA_TYPES[fmt],
    )
