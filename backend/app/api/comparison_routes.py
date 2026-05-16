from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Literal
from pathlib import Path
import shutil
from app.core.session import session_manager
from app.core.config import get_settings
from app.services.comparison import comparator
from app.api.auth_routes import get_current_user

router = APIRouter()
settings = get_settings()

# ─── Сравнение документов ─────────────────────────────────

@router.post("/compare/upload")
async def upload_comparison_documents(
    session_id: str,
    file1: UploadFile = File(...),
    file2: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Загружает два документа для сравнения"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    files = [(file1, "doc1"), (file2, "doc2")]
    saved_paths = {}

    for file, key in files:
        ext = Path(file.filename).suffix.lower()
        if ext not in settings.ALLOWED_UPLOAD_FORMATS:
            raise HTTPException(status_code=400, detail=f"{file.filename}: allowed formats are {sorted(settings.ALLOWED_UPLOAD_FORMATS)}")
        
        file_path = Path(f"{settings.UPLOAD_DIR}/{session_id}/{key}_{file.filename}")
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        saved_paths[key] = str(file_path)

    session["comparison_docs"] = saved_paths

    return {
        "status": "uploaded",
        "session_id": session_id,
        "doc1": file1.filename,
        "doc2": file2.filename
    }

@router.post("/compare/semantic")
async def compare_semantic(session_id: str, user: dict = Depends(get_current_user)):
    """Сравнение по смыслу — общие темы, различия, схожесть"""
    session = session_manager.get_session(session_id)
    if not session or "comparison_docs" not in session:
        raise HTTPException(status_code=400, detail="Upload two documents first")
    docs = session["comparison_docs"]

    try:
        result = comparator.compare_semantic(docs["doc1"], docs["doc2"])
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/compare/technical")
async def compare_technical(session_id: str, user: dict = Depends(get_current_user)):
    """Сравнение технических спецификаций — параметры, значения, совпадения"""
    session = session_manager.get_session(session_id)
    if not session or "comparison_docs" not in session:
        raise HTTPException(status_code=400, detail="Upload two documents first")
    docs = session["comparison_docs"]

    try:
        result = comparator.compare_technical_specs(docs["doc1"], docs["doc2"])
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/compare/exact")
async def compare_exact(session_id: str, user: dict = Depends(get_current_user)):
    """Точное посимвольное сравнение — каждый символ должен совпадать"""
    session = session_manager.get_session(session_id)
    if not session or "comparison_docs" not in session:
        raise HTTPException(status_code=400, detail="Upload two documents first")
    docs = session["comparison_docs"]
    try:
        result = comparator.compare_exact(docs["doc1"], docs["doc2"])
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
