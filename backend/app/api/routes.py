from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from pathlib import Path
from typing import Literal
import shutil
import json

from app.core.session import session_manager
from app.core.config import get_settings
from app.services.document import doc_processor
from app.services.llm import llm_service
from app.services.presentation import pptx_generator
from app.services.translation import translation_service
from app.services.converter import converter_service
from app.services.ai_settings_service import get_document_context
from app.api.auth_routes import get_current_user

router = APIRouter()
settings = get_settings()

class ChatRequest(BaseModel):
    session_id: str
    question: str

class ChatResponse(BaseModel):
    answer: str
    session_id: str

class TranslateRequest(BaseModel):
    session_id: str
    target_language: Literal["kz", "ru", "en"]

class TranslateTextRequest(BaseModel):
    text: str
    target_language: Literal["kz", "ru", "en"]

# ─── Сессии ─────────────────────────────────────────────

@router.post("/sessions")
async def create_session(user: dict = Depends(get_current_user)):
    session_id = session_manager.create_session()
    return {"session_id": session_id, "status": "created"}

@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, user: dict = Depends(get_current_user)):
    session_manager.cleanup_session(session_id)
    return {"status": "deleted"}

# ─── Документы ──────────────────────────────────────────

@router.post("/documents/upload")
async def upload_document(session_id: str, file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Docling поддерживает: PDF, DOCX, PPTX, XLSX, HTML, TXT, PNG, JPG, TIFF, TEX
    allowed = {
        ".pdf", ".docx", ".doc", ".pptx", ".ppt", 
        ".xlsx", ".xls", ".html", ".htm", ".txt",
        ".png", ".jpg", ".jpeg", ".tiff", ".tex"
    }
    ext = Path(file.filename).suffix.lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"Allowed formats: {', '.join(sorted(allowed))}")

    file_path = Path(f"{settings.UPLOAD_DIR}/{session_id}/{file.filename}")
    file_path.parent.mkdir(parents=True, exist_ok=True)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        vector_store, markdown_text = doc_processor.process_file(str(file_path), session_id)
        session["document"] = file.filename
        session["vector_store"] = True
        session["preview"] = markdown_text[:800]

        return {
            "status": "processed",
            "filename": file.filename,
            "session_id": session_id,
            "format": ext,
            "preview": markdown_text[:800],
            "char_count": len(markdown_text),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── Чат ────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, user: dict = Depends(get_current_user)):
    session = session_manager.get_session(request.session_id)
    if not session or not session.get("vector_store"):
        raise HTTPException(status_code=400, detail="No document uploaded")

    doc_name = session.get("document", "")
    doc_context = get_document_context(user["username"], doc_name) if doc_name else None

    try:
        answer = llm_service.chat(request.question, request.session_id, doc_context)
        return ChatResponse(answer=answer, session_id=request.session_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── Стриминг чата ──────────────────────────────────────

@router.get("/chat/stream")
async def chat_stream(
    session_id: str,
    question: str,
    user: dict = Depends(get_current_user),
):
    session = session_manager.get_session(session_id)
    if not session or not session.get("vector_store"):
        raise HTTPException(status_code=400, detail="No document uploaded")

    doc_name = session.get("document", "")
    doc_context = get_document_context(user["username"], doc_name) if doc_name else None

    async def generate():
        yield f"data: {json.dumps({'status': 'Ищу релевантные фрагменты...'})}\n\n"
        try:
            first = True
            async for chunk in llm_service.chat_astream(question, session_id, doc_context):
                if first:
                    yield f"data: {json.dumps({'status': 'Формирую ответ...'})}\n\n"
                    first = False
                if chunk:
                    yield f"data: {json.dumps({'text': chunk})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── Презентации ────────────────────────────────────────

@router.post("/presentations/generate")
async def generate_presentation(session_id: str, user: dict = Depends(get_current_user)):
    session = session_manager.get_session(session_id)
    if not session or not session.get("vector_store"):
        raise HTTPException(status_code=400, detail="No document uploaded")

    try:
        structure = llm_service.generate_presentation_structure(session_id)
        file_path = pptx_generator.generate(structure, session_id)

        return {
            "status": "generated",
            "filename": "presentation.pptx",
            "structure": structure,
            "download_url": f"/api/presentations/download/{session_id}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/presentations/download/{session_id}")
async def download_presentation(session_id: str, user: dict = Depends(get_current_user)):
    file_path = Path(f"{settings.UPLOAD_DIR}/{session_id}/presentation.pptx")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Presentation not found")

    return FileResponse(
        str(file_path),
        filename="presentation.pptx",
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation"
    )

# ─── Перевод ────────────────────────────────────────────

@router.post("/translate")
async def translate_document(request: TranslateRequest, user: dict = Depends(get_current_user)):
    """Переводит содержимое документа на kz / ru / en"""
    session = session_manager.get_session(request.session_id)
    if not session or not session.get("vector_store"):
        raise HTTPException(status_code=400, detail="No document uploaded")
    try:
        translated = translation_service.translate_document(
            request.session_id, request.target_language
        )
        return {
            "translated": translated,
            "language": request.target_language,
            "session_id": request.session_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/translate/export")
async def translate_export(request: TranslateRequest, target_format: Literal["txt", "md", "docx", "pdf"], user: dict = Depends(get_current_user)):
    """Переводит документ и сразу экспортирует в формат для скачивания"""
    session = session_manager.get_session(request.session_id)
    if not session or not session.get("vector_store"):
        raise HTTPException(status_code=400, detail="No document uploaded")
    
    try:
        # 1. Сначала переводим
        translated_text = translation_service.translate_document(
            request.session_id, request.target_language
        )
        
        # 2. Сохраняем в файл нужного формата
        output_filename = f"translated_{request.target_language}"
        output_path = Path(f"{settings.UPLOAD_DIR}/{request.session_id}/{output_filename}{converter_service.FORMAT_EXTENSIONS[target_format]}")
        
        converter_service.text_to_format(
            translated_text, 
            output_path, 
            target_format, 
            title=f"Translated ({request.target_language})"
        )
        
        return {
            "status": "exported",
            "format": target_format,
            "language": request.target_language,
            "download_url": f"/api/documents/converted/{request.session_id}/{target_format}?translated=true"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── Конвертация формата ─────────────────────────────────

@router.post("/documents/convert")
async def convert_document(session_id: str, target_format: Literal["txt", "md", "docx", "pdf"], user: dict = Depends(get_current_user)):
    """Конвертирует документ в txt / md / docx / pdf"""
    session = session_manager.get_session(session_id)
    if not session or not session.get("vector_store"):
        raise HTTPException(status_code=400, detail="No document uploaded")
    try:
        output_path = converter_service.convert(session_id, target_format)
        return {
            "status": "converted",
            "format": target_format,
            "download_url": f"/api/documents/converted/{session_id}/{target_format}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/documents/converted/{session_id}/{fmt}")
async def download_converted(session_id: str, fmt: str, translated: bool = False, user: dict = Depends(get_current_user)):
    """Скачивает сконвертированный или переведённый файл"""
    ext_map = {"txt": ".txt", "md": ".md", "docx": ".docx", "pdf": ".pdf"}
    if fmt not in ext_map:
        raise HTTPException(status_code=400, detail="Unknown format")

    session_dir = Path(settings.UPLOAD_DIR) / session_id
    prefix = "translated_*" if translated else "converted_*"
    candidates = list(session_dir.glob(f"{prefix}{ext_map[fmt]}"))
    
    if not candidates:
        raise HTTPException(status_code=404, detail="File not found. Run conversion/translation first.")

    media_types = {
        "txt":  "text/plain",
        "md":   "text/markdown",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "pdf":  "application/pdf",
    }
    return FileResponse(
        str(candidates[0]),
        filename=candidates[0].name,
        media_type=media_types[fmt]
    )

# ─── Health Check ───────────────────────────────────────

@router.get("/health")
async def health_check():
    return {"status": "ok", "service": "DocuAI", "parser": "Docling"}
