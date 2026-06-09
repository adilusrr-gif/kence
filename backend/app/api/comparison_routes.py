from app.core.limiter import limiter
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Request, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Literal
from pathlib import Path
import shutil
import asyncio
from app.core.session import session_manager
from app.core.config import get_settings
from app.services.comparison import comparator
from app.services import analytics_service
from app.services.analytics_service import resolve_org_id
from app.api.auth_routes import get_current_user

router = APIRouter()
settings = get_settings()


def _require_comparison_docs(session_id: str, current_user: dict) -> dict:
    """Validate session ownership and presence of comparison docs, return the docs dict."""
    from app.api.routes import _verify_session_access
    session = session_manager.get_session(session_id)
    if not session or "comparison_docs" not in session:
        raise HTTPException(status_code=400, detail="Upload two documents first")
    _verify_session_access(session, current_user)
    return session["comparison_docs"]


# ─── Сравнение документов ─────────────────────────────────

@router.post("/compare/upload")
@limiter.limit("10/minute")
async def upload_comparison_documents(
    request: Request,
    session_id: str = Query(...),
    file1: UploadFile = File(...),
    file2: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Загружает два документа для сравнения"""
    from uuid import UUID
    try:
        UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session_id")

    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    files = [(file1, "doc1"), (file2, "doc2")]
    saved_paths = {}

    for file, key in files:
        # File size validation
        if file.size and file.size > settings.MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"{file.filename}: file too large. Max {settings.MAX_FILE_SIZE // 1024 // 1024} MB"
            )

        ext = Path(file.filename).suffix.lower()
        if ext not in settings.ALLOWED_UPLOAD_FORMATS:
            raise HTTPException(
                status_code=400,
                detail=f"{file.filename}: allowed formats are {sorted(settings.ALLOWED_UPLOAD_FORMATS)}"
            )

        file_path = Path(f"{settings.UPLOAD_DIR}/{session_id}/{key}_{file.filename}")
        file_path.parent.mkdir(parents=True, exist_ok=True)

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # MIME validation (same as main upload)
        from app.core.mime_validator import validate_mime
        ok, detected = validate_mime(file_path)
        if not ok:
            file_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=415,
                detail=f"{file.filename}: content does not match extension (detected: {detected})"
            )

        saved_paths[key] = str(file_path)

    session["comparison_docs"] = saved_paths
    session_manager.save_session(session_id)

    return {
        "status": "uploaded",
        "session_id": session_id,
        "doc1": file1.filename,
        "doc2": file2.filename
    }

@router.post("/compare/semantic")
@limiter.limit("5/minute")
async def compare_semantic(request: Request, session_id: str = Query(...), user: dict = Depends(get_current_user)):
    """Сравнение по смыслу — общие темы, различия, схожесть"""
    docs = _require_comparison_docs(session_id, user)
    try:
        result = await asyncio.to_thread(comparator.compare_semantic, docs["doc1"], docs["doc2"])
        _u = user.get("username")
        asyncio.create_task(asyncio.to_thread(
            analytics_service.log_event, "compare",
            username=_u, session_id=session_id, mode="semantic",
            org_id=resolve_org_id(_u),
        ))
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/compare/technical")
@limiter.limit("5/minute")
async def compare_technical(request: Request, session_id: str = Query(...), user: dict = Depends(get_current_user)):
    """Сравнение технических спецификаций — параметры, значения, совпадения"""
    docs = _require_comparison_docs(session_id, user)
    try:
        result = await asyncio.to_thread(comparator.compare_technical_specs, docs["doc1"], docs["doc2"])
        _u = user.get("username")
        asyncio.create_task(asyncio.to_thread(
            analytics_service.log_event, "compare",
            username=_u, session_id=session_id, mode="technical",
            org_id=resolve_org_id(_u),
        ))
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/compare/exact")
@limiter.limit("5/minute")
async def compare_exact(request: Request, session_id: str = Query(...), user: dict = Depends(get_current_user)):
    """Точное посимвольное сравнение — каждый символ должен совпадать"""
    docs = _require_comparison_docs(session_id, user)
    try:
        result = await asyncio.to_thread(comparator.compare_exact, docs["doc1"], docs["doc2"])
        _u = user.get("username")
        asyncio.create_task(asyncio.to_thread(
            analytics_service.log_event, "compare",
            username=_u, session_id=session_id, mode="exact",
            org_id=resolve_org_id(_u),
        ))
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/compare/thematic")
@limiter.limit("5/minute")
async def compare_thematic(request: Request, session_id: str = Query(...), user: dict = Depends(get_current_user)):
    """Тематическое сравнение: темы, аргументы, позиции, тон документов"""
    docs = _require_comparison_docs(session_id, user)
    try:
        result = await asyncio.to_thread(comparator.compare_thematic, docs["doc1"], docs["doc2"])
        _u = user.get("username")
        asyncio.create_task(asyncio.to_thread(
            analytics_service.log_event, "compare",
            username=_u, session_id=session_id, mode="thematic",
            org_id=resolve_org_id(_u),
        ))
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/compare/status/{session_id}")
async def comparison_status(session_id: str, user: dict = Depends(get_current_user)):
    """Статус сравнения в сессии"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "has_comparison_docs": "comparison_docs" in session,
        "docs": session.get("comparison_docs", {}),
        "has_single_doc": session.get("vector_store", False)
    }
