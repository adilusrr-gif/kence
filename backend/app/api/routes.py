from app.core.limiter import limiter
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Request, Query
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from pathlib import Path
from typing import Literal, Optional
from uuid import UUID
import shutil
import json
import asyncio


from app.core.session import session_manager
from app.core.config import get_settings
from app.core.mime_validator import validate_mime
from app.services.document import doc_processor
from app.services.llm import llm_service
from app.services.translation import translation_service
from app.services.converter import converter_service
from app.services.ai_settings_service import get_document_context
from app.services import memory_service
from app.services import analytics_service
from app.services import audit_service
from app.api.auth_routes import get_current_user
from app.core.features import get_edition_flags
from app.services.org_service import get_user_orgs

router = APIRouter()
settings = get_settings()


def _verify_session_access(session: dict, current_user: dict) -> None:
    """Raises 403 if the user does not own the session. Admins bypass the check.
    Sessions without an owner (created before ownership tracking) remain accessible."""
    if current_user.get("role") == "admin":
        return
    owner = session.get("owner_username")
    if owner and owner != current_user.get("username"):
        raise HTTPException(status_code=403, detail="Access denied to this session")


def _require_chat_session(session_id: str, current_user: dict) -> tuple[dict, str, object]:
    """Validate session has a document, enforce ownership, return (session, doc_name, doc_context)."""
    session = session_manager.get_session(session_id)
    if not session or not session.get("vector_store"):
        raise HTTPException(status_code=400, detail="No document uploaded")
    _verify_session_access(session, current_user)
    doc_name = session.get("document", "")
    username = current_user.get("username", "")
    doc_context = get_document_context(username, doc_name) if doc_name and username else None
    return session, doc_name, doc_context


def _require_image_session(session_id: str) -> tuple[str, Path]:
    """Validate session has an image document and return (doc_name, image_path)."""
    from app.services.vision_service import vision_service as vs
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=400, detail="No document uploaded")
    doc_name = session.get("document", "")
    ext = Path(doc_name).suffix.lower() if doc_name else ""
    if ext not in _IMAGE_EXTS:
        raise HTTPException(status_code=400, detail="Document is not an image")
    if not vs.is_available():
        raise HTTPException(status_code=503, detail=f"Vision model '{settings.VISION_MODEL}' not available. Run: ollama pull {settings.VISION_MODEL}")
    image_path = Path(f"{settings.UPLOAD_DIR}/{session_id}/{doc_name}")
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found")
    return doc_name, image_path


class ChatRequest(BaseModel):
    session_id: str
    question: str
    language: Literal["ru", "kz", "en"] = "ru"

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

@router.get("/sessions")
async def list_sessions(user: dict = Depends(get_current_user)):
    """Returns active sessions owned by the current user (admins see all)."""
    try:
        from app.core.database import SessionLocal
        from app.models.models import DocSession
        with SessionLocal() as db:
            q = db.query(DocSession).filter(DocSession.has_vector_store == True)
            if user.get("role") != "admin":
                q = q.filter(DocSession.owner_username == user["username"])
            rows = q.order_by(DocSession.last_activity.desc()).limit(50).all()
            return [
                {
                    "session_id": r.session_id,
                    "document_name": r.document_name,
                    "has_vector_store": r.has_vector_store,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                    "last_activity": r.last_activity.isoformat() if r.last_activity else None,
                }
                for r in rows
            ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, request: Request, user: dict = Depends(get_current_user)):
    session = session_manager.get_session(session_id)
    doc_name = (session or {}).get("document")
    if session:
        _verify_session_access(session, user)
    session_manager.cleanup_session(session_id)
    memory_service.clear_history(session_id)
    asyncio.create_task(asyncio.to_thread(
        audit_service.log, "delete",
        username=user.get("username"),
        session_id=session_id,
        document_name=doc_name,
        ip_address=getattr(request.client, "host", None) if request.client else None,
    ))
    return {"status": "deleted"}

# ─── История чата ────────────────────────────────────────

@router.get("/chat/history/{session_id}")
async def get_chat_history(session_id: str, request: Request, limit: int = Query(20, ge=1, le=100), user: dict = Depends(get_current_user)):
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _verify_session_access(session, user)
    asyncio.create_task(asyncio.to_thread(
        audit_service.log, "view",
        username=user.get("username"),
        session_id=session_id,
        document_name=session.get("document"),
        ip_address=getattr(request.client, "host", None) if request.client else None,
    ))
    return {"session_id": session_id, "messages": memory_service.get_history(session_id, limit)}

@router.delete("/chat/history/{session_id}")
async def clear_chat_history(session_id: str, user: dict = Depends(get_current_user)):
    session = session_manager.get_session(session_id)
    if session:
        _verify_session_access(session, user)
        session.pop("conversation_summary", None)
        session_manager.save_session(session_id)
    memory_service.clear_history(session_id)
    return {"status": "cleared"}

_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".webp", ".heic"}

# ─── Документы ──────────────────────────────────────────

@router.post("/documents/upload")
@limiter.limit("10/minute")
async def upload_document(request: Request, session_id: str, file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    try:
        UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session_id")

    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Strip any directory components and enforce max filename length
    safe_name = Path(file.filename or "").name
    if not safe_name or len(safe_name) > 200:
        raise HTTPException(status_code=400, detail="Invalid filename")

    ext = Path(safe_name).suffix.lower()
    if ext not in settings.ALLOWED_UPLOAD_FORMATS:
        raise HTTPException(status_code=400, detail=f"Allowed formats: {', '.join(sorted(settings.ALLOWED_UPLOAD_FORMATS))}")

    if file.size and file.size > settings.MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail=f"File too large. Max {settings.MAX_FILE_SIZE // 1024 // 1024} MB")

    upload_root = Path(settings.UPLOAD_DIR).resolve()
    file_path = (upload_root / session_id / safe_name).resolve()
    if not file_path.is_relative_to(upload_root):
        raise HTTPException(status_code=400, detail="Invalid file path")
    file_path.parent.mkdir(parents=True, exist_ok=True)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    ok, detected_mime = validate_mime(file_path)
    if not ok:
        file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=415, detail=f"File content does not match its extension (detected: {detected_mime})")

    try:
        vector_store, markdown_text, html_text = doc_processor.process_file(str(file_path), session_id)
        session["document"] = safe_name
        session["vector_store"] = True
        session["preview"] = markdown_text[:800]
        session["markdown_text"] = markdown_text
        session["html_text"] = html_text if len(html_text) < 15_000_000 else ""
        session["owner_username"] = user.get("username")
        session_manager.save_session(session_id)
        _username = user.get("username")
        asyncio.create_task(asyncio.to_thread(
            analytics_service.log_event, "upload",
            username=_username, session_id=session_id,
            file_format=ext.lstrip(".").upper(),
            org_id=analytics_service.resolve_org_id(_username),
        ))
        asyncio.create_task(asyncio.to_thread(
            audit_service.log, "upload",
            username=_username,
            session_id=session_id,
            document_name=safe_name,
            ip_address=getattr(request.client, "host", None) if request.client else None,
            detail={"format": ext.lstrip(".").upper()},
        ))

        return {
            "status": "processed",
            "filename": safe_name,
            "session_id": session_id,
            "format": ext,
            "is_image": ext in _IMAGE_EXTS,
            "preview": markdown_text[:800],
            "char_count": len(markdown_text),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── Отдача файла изображения ───────────────────────────

@router.get("/documents/{session_id}/image")
async def get_document_image(
    session_id: str,
    token: Optional[str] = Query(None),
    bearer_user: Optional[dict] = Depends(get_current_user),
):
    """Returns image file for preview. Accepts Bearer header OR ?token= query param
    so that <img src="...?token=..."> works without JS fetch."""
    from app.api.auth_routes import verify_token
    if bearer_user is None:
        if not token:
            raise HTTPException(status_code=401, detail="Not authenticated")
        verify_token(token)

    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    doc_name = session.get("document", "")
    ext = Path(doc_name).suffix.lower()
    if ext not in _IMAGE_EXTS:
        raise HTTPException(status_code=400, detail="Document is not an image")
    image_path = Path(f"{settings.UPLOAD_DIR}/{session_id}/{doc_name}")
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found")
    mime_map = {
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".tiff": "image/tiff", ".bmp": "image/bmp",
        ".webp": "image/webp", ".heic": "image/heic",
    }
    return FileResponse(str(image_path), media_type=mime_map.get(ext, "application/octet-stream"))

# ─── Мультимодальный / визуальный анализ ─────────────────


@router.get("/documents/{session_id}/visual-describe")
async def visual_describe(session_id: str, user: dict = Depends(get_current_user)):
    """Полное визуальное описание изображения-документа через VLM."""
    from app.services.vision_service import vision_service
    doc_name, image_path = _require_image_session(session_id)
    try:
        description = await asyncio.to_thread(vision_service.describe, str(image_path))
        return {"description": description, "session_id": session_id, "filename": doc_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/chat/visual-stream")
@limiter.limit("10/minute")
async def visual_chat_stream(
    request: Request,
    session_id: str,
    question: str,
    user: dict = Depends(get_current_user),
):
    """SSE-стриминг ответа VLM на вопрос по изображению."""
    from app.services.vision_service import vision_service
    _, image_path = _require_image_session(session_id)

    async def generate():
        yield f"data: {json.dumps({'status': 'Анализирую изображение…'})}\n\n"
        full: list[str] = []
        try:
            first = True
            async for chunk in vision_service.answer_stream(str(image_path), question):
                if first:
                    yield f"data: {json.dumps({'status': 'Формирую ответ…'})}\n\n"
                    first = False
                if chunk:
                    full.append(chunk)
                    yield f"data: {json.dumps({'text': chunk})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            yield "data: [DONE]\n\n"
            if full:
                memory_service.add_message(session_id, "user", question)
                memory_service.add_message(session_id, "assistant", "".join(full))

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

# ─── Чат ────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
@limiter.limit("20/minute")
async def chat(request: Request, body: ChatRequest, user: dict = Depends(get_current_user)):
    _, _, doc_context = _require_chat_session(body.session_id, user)
    history = memory_service.get_history(body.session_id, limit=10)
    language = body.language or request.headers.get("x-language", "ru")

    try:
        answer = llm_service.chat(body.question, body.session_id, doc_context, history, language=language)
        memory_service.add_message(body.session_id, "user", body.question)
        memory_service.add_message(body.session_id, "assistant", answer)
        return ChatResponse(answer=answer, session_id=body.session_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── Стриминг чата ──────────────────────────────────────

@router.get("/chat/stream")
@limiter.limit("20/minute")
async def chat_stream(
    request: Request,
    session_id: str,
    question: str,
    mode: str = "precise",
    language: str = "ru",
    user: dict = Depends(get_current_user),
):
    _, _, doc_context = _require_chat_session(session_id, user)
    history = memory_service.get_history(session_id, limit=10)
    lang = language or request.headers.get("x-language", "ru")

    async def generate():
        yield f"data: {json.dumps({'status': 'Ищу релевантные фрагменты...'})}\n\n"
        full_answer: list[str] = []
        retrieved_docs = []
        try:
            # Retrieve docs first so we can emit citations at the end
            retrieved_docs, context = await llm_service.retrieve_docs_and_context(
                question, session_id, doc_context, mode
            )
            first = True
            async for chunk in llm_service.chat_astream(
                question, session_id, mode=mode, history=history,
                prebuilt_context=context, language=lang,
            ):
                if first:
                    yield f"data: {json.dumps({'status': 'Формирую ответ...'})}\n\n"
                    first = False
                if chunk:
                    full_answer.append(chunk)
                    yield f"data: {json.dumps({'text': chunk})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            # Emit source citations before [DONE]
            if retrieved_docs:
                sources = [
                    {
                        "text":   doc.page_content[:220],
                        "source": doc.metadata.get("source", ""),
                        "page":   doc.metadata.get("page", None),
                    }
                    for doc in retrieved_docs
                ]
                yield f"data: {json.dumps({'sources': sources})}\n\n"
            yield "data: [DONE]\n\n"
            if full_answer:
                memory_service.add_message(session_id, "user", question)
                memory_service.add_message(session_id, "assistant", "".join(full_answer))
                _username = user.get("username")
                asyncio.create_task(asyncio.to_thread(
                    analytics_service.log_event, "chat",
                    username=_username, session_id=session_id, mode=mode,
                    org_id=analytics_service.resolve_org_id(_username),
                ))

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── Содержимое документа ───────────────────────────────

@router.get("/documents/{session_id}/content")
async def get_document_content(session_id: str, user: dict = Depends(get_current_user)):
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _verify_session_access(session, user)
    return {
        "filename": session.get("document", ""),
        "markdown": session.get("markdown_text", ""),
        "html": session.get("html_text", ""),
        "char_count": len(session.get("markdown_text") or ""),
    }

# ─── Перевод ────────────────────────────────────────────

@router.post("/translate")
@limiter.limit("10/minute")
async def translate_document(request: Request, body: TranslateRequest, user: dict = Depends(get_current_user)):
    """Переводит содержимое документа на kz / ru / en"""
    session = session_manager.get_session(body.session_id)
    if not session or not session.get("vector_store"):
        raise HTTPException(status_code=400, detail="No document uploaded")
    _verify_session_access(session, user)
    markdown_text = session.get("markdown_text", "")
    if not markdown_text:
        raise HTTPException(status_code=400, detail="Document text not found, please re-upload")
    try:
        translated = await asyncio.to_thread(
            translation_service.translate_document,
            markdown_text, body.target_language
        )
        _username = user.get("username")
        asyncio.create_task(asyncio.to_thread(
            analytics_service.log_event, "translate",
            username=_username, session_id=body.session_id, language=body.target_language,
            org_id=analytics_service.resolve_org_id(_username),
        ))
        return {
            "translated": translated,
            "language": body.target_language,
            "session_id": body.session_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/translate/export")
@limiter.limit("5/minute")
async def translate_export(request: Request, body: TranslateRequest, target_format: Literal["txt", "md", "docx"], user: dict = Depends(get_current_user)):
    """Переводит документ и сразу экспортирует в формат для скачивания"""
    session = session_manager.get_session(body.session_id)
    if not session or not session.get("vector_store"):
        raise HTTPException(status_code=400, detail="No document uploaded")
    _verify_session_access(session, user)

    markdown_text = session.get("markdown_text", "")
    if not markdown_text:
        raise HTTPException(status_code=400, detail="Document text not found, please re-upload")
    try:
        # 1. Сначала переводим
        translated_text = await asyncio.to_thread(
            translation_service.translate_document,
            markdown_text, body.target_language
        )

        # 2. Сохраняем в файл нужного формата
        output_filename = f"translated_{body.target_language}"
        output_path = Path(f"{settings.UPLOAD_DIR}/{body.session_id}/{output_filename}{converter_service.FORMAT_EXTENSIONS[target_format]}")

        converter_service.text_to_format(
            translated_text,
            output_path,
            target_format,
            title=f"Translated ({body.target_language})"
        )

        return {
            "status": "exported",
            "format": target_format,
            "language": body.target_language,
            "download_url": f"/api/documents/converted/{body.session_id}/{target_format}?translated=true"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── Конвертация формата ─────────────────────────────────

@router.post("/documents/convert")
@limiter.limit("10/minute")
async def convert_document(request: Request, session_id: str, target_format: Literal["txt", "md", "docx", "pdf"], user: dict = Depends(get_current_user)):
    """Конвертирует документ в txt / md / docx / pdf"""
    session = session_manager.get_session(session_id)
    if not session or not session.get("vector_store"):
        raise HTTPException(status_code=400, detail="No document uploaded")
    _verify_session_access(session, user)
    try:
        output_path = converter_service.convert(session_id, target_format)
        _username = user.get("username")
        asyncio.create_task(asyncio.to_thread(
            analytics_service.log_event, "convert",
            username=_username, session_id=session_id, target_format=target_format,
            org_id=analytics_service.resolve_org_id(_username),
        ))
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
    # Validate session_id to prevent path traversal
    try:
        UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session_id")

    ext_map = {"txt": ".txt", "md": ".md", "docx": ".docx", "pdf": ".pdf"}
    if fmt not in ext_map:
        raise HTTPException(status_code=400, detail="Unknown format")

    session_dir = Path(settings.UPLOAD_DIR) / session_id
    # Additional path traversal guard: ensure resolved path is under UPLOAD_DIR
    upload_root = Path(settings.UPLOAD_DIR).resolve()
    if not session_dir.resolve().is_relative_to(upload_root):
        raise HTTPException(status_code=400, detail="Invalid session_id")
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
    # Gov watermark: prefix filename with CONFIDENTIAL marker
    orgs = get_user_orgs(user["username"])
    plan = orgs[0]["plan"] if orgs else "free"
    flags = get_edition_flags(plan)
    from datetime import datetime, timezone
    base_filename = candidates[0].name
    if flags.get("watermark_downloads"):
        ts = datetime.now(timezone.utc).strftime("%Y%m%d")
        base_filename = f"[CONFIDENTIAL_{user['username']}_{ts}] {base_filename}"

    resp = FileResponse(
        str(candidates[0]),
        filename=base_filename,
        media_type=media_types[fmt],
    )
    if flags.get("watermark_downloads"):
        resp.headers["X-Content-Watermark"] = f"KENCE.ai | {user['username']} | {datetime.now(timezone.utc).isoformat()}"
    return resp

# ─── Vision status ──────────────────────────────────────

@router.get("/vision/status")
async def vision_status(user: dict = Depends(get_current_user)):
    from app.services.vision_service import vision_service
    return {
        "model": settings.VISION_MODEL,
        "available": vision_service.is_available(),
        "pull_command": f"ollama pull {settings.VISION_MODEL}" if not vision_service.is_available() else None,
    }

# ─── Document Edit Mode ────────────────────────────────

class SaveMarkdownRequest(BaseModel):
    markdown: str


@router.put("/documents/content/{session_id}")
async def save_document_content(
    session_id: str,
    body: SaveMarkdownRequest,
    current_user: dict = Depends(get_current_user),
):
    """Auto-save edited markdown back to the session (edit mode)."""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _verify_session_access(session, current_user)
    session["markdown_text"] = body.markdown
    session_manager.save_session(session_id)
    return {"ok": True}


class ExportMarkdownRequest(BaseModel):
    session_id: str
    markdown: str
    format: Literal["docx", "pdf"] = "docx"


@router.post("/documents/export-markdown")
@limiter.limit("10/minute")
async def export_markdown(
    request: Request,
    body: ExportMarkdownRequest,
    current_user: dict = Depends(get_current_user),
):
    """Convert edited markdown (with tables + [CHART] directives) to DOCX or PDF."""
    try:
        UUID(body.session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session_id")

    upload_root = Path(settings.UPLOAD_DIR).resolve()
    session_dir = (upload_root / body.session_id).resolve()
    if not str(session_dir).startswith(str(upload_root)):
        raise HTTPException(status_code=400, detail="Invalid session_id")
    session_dir.mkdir(parents=True, exist_ok=True)

    ext = ".docx" if body.format == "docx" else ".pdf"
    output_path = session_dir / f"edited_document{ext}"

    if body.format == "docx":
        from app.services.converter import _markdown_to_docx
        _markdown_to_docx(body.markdown, output_path, llm_service=llm_service)
    else:
        from app.services.converter import _text_to_pdf
        _text_to_pdf(body.markdown, output_path)

    media = (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        if body.format == "docx"
        else "application/pdf"
    )
    return FileResponse(
        path=str(output_path),
        filename=f"edited_document{ext}",
        media_type=media,
    )


# ─── Health Check ───────────────────────────────────────

@router.get("/health")
async def health_check():
    return {"status": "ok", "service": "DocuAI", "parser": "Docling"}


@router.get("/health/full")
async def health_check_full():
    """Deep health check — verifies all backend services.
    Returns overall status + per-service breakdown.
    Used by Docker HEALTHCHECK and monitoring systems.
    """
    import asyncio as _asyncio
    from app.services.llm import llm_service, get_llm_metrics
    from app.core.database import check_db_health

    async def _check_neo4j():
        try:
            from app.services.graph_service import get_driver
            drv = get_driver()
            if not drv:
                return {"status": "down", "error": "driver not initialized"}
            async with drv.session() as sess:
                await sess.run("RETURN 1")
            return {"status": "ok"}
        except Exception as e:
            return {"status": "down", "error": str(e)[:120]}

    async def _check_chroma():
        try:
            from app.services.embeddings_service import embeddings_service
            _ = embeddings_service.embeddings
            return {"status": "ok"}
        except Exception as e:
            return {"status": "degraded", "error": str(e)[:80]}

    ollama_status, db_status, neo4j_status, chroma_status = await _asyncio.gather(
        llm_service.health_check(),
        check_db_health(),
        _check_neo4j(),
        _check_chroma(),
        return_exceptions=True,
    )

    def _safe(r):
        return r if isinstance(r, dict) else {"status": "error", "error": str(r)}

    services = {
        "ollama":    _safe(ollama_status),
        "database":  _safe(db_status),
        "neo4j":     _safe(neo4j_status),
        "chroma":    _safe(chroma_status),
    }
    llm_metrics = get_llm_metrics()

    all_ok     = all(s.get("status") == "ok"     for s in services.values())
    any_down   = any(s.get("status") == "down"   for s in services.values())
    overall    = "ok" if all_ok else ("degraded" if not any_down else "down")

    return {
        "status":   overall,
        "services": services,
        "llm":      llm_metrics,
        "sessions": {"active": len(session_manager._mem)},
    }
