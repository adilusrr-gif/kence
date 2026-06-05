from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Literal
from pathlib import Path
import shutil
import asyncio
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.core.session import session_manager
from app.core.config import get_settings
from app.services.comparison import comparator
from app.services import analytics_service
from app.api.auth_routes import get_current_user

router = APIRouter()
settings = get_settings()
limiter = Limiter(key_func=get_remote_address)


def _require_comparison_docs(session_id: str) -> dict:
    """Validate session has comparison docs and return them."""
    session = session_manager.get_session(session_id)
    if not session or "comparison_docs" not in session:
        raise HTTPException(status_code=400, detail="Upload two documents first")
    return session["comparison_docs"]


# ─── Сравнение документов ─────────────────────────────────

@router.post("/compare/upload")
@limiter.limit("10/minute")
async def upload_comparison_documents(
    request: Request,
    session_id: str,
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

    return {
        "status": "uploaded",
        "session_id": session_id,
        "doc1": file1.filename,
        "doc2": file2.filename
    }

@router.post("/compare/semantic")
@limiter.limit("5/minute")
async def compare_semantic(request: Request, session_id: str, user: dict = Depends(get_current_user)):
    """Сравнение по смыслу — общие темы, различия, схожесть"""
    docs = _require_comparison_docs(session_id)
    try:
        result = comparator.compare_semantic(docs["doc1"], docs["doc2"])
        analytics_service.log_event("compare", username=user.get("sub"), session_id=session_id, mode="semantic")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/compare/technical")
@limiter.limit("5/minute")
async def compare_technical(request: Request, session_id: str, user: dict = Depends(get_current_user)):
    """Сравнение технических спецификаций — параметры, значения, совпадения"""
    docs = _require_comparison_docs(session_id)
    try:
        result = comparator.compare_technical_specs(docs["doc1"], docs["doc2"])
        analytics_service.log_event("compare", username=user.get("sub"), session_id=session_id, mode="technical")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/compare/exact")
@limiter.limit("5/minute")
async def compare_exact(request: Request, session_id: str, user: dict = Depends(get_current_user)):
    """Точное посимвольное сравнение — каждый символ должен совпадать"""
    docs = _require_comparison_docs(session_id)
    try:
        result = comparator.compare_exact(docs["doc1"], docs["doc2"])
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/compare/thematic")
@limiter.limit("5/minute")
async def compare_thematic(request: Request, session_id: str, user: dict = Depends(get_current_user)):
    """Тематическое сравнение: темы, аргументы, позиции, тон документов"""
    docs = _require_comparison_docs(session_id)
    try:
        result = await asyncio.to_thread(comparator.compare_thematic, docs["doc1"], docs["doc2"])
        analytics_service.log_event("compare", username=user.get("sub"), session_id=session_id, mode="thematic")
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
