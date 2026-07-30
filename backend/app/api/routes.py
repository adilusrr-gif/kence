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
import contextlib
import logging


from app.core.session import session_manager
from app.core.config import get_settings
from app.core import generation_registry
from app.core.mime_validator import validate_mime
from app.services.document import doc_processor, doc_executor, DocumentTooLargeError
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
from app.services.share_service import check_session_access

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)


def _verify_session_access(session_id: str, session: dict, current_user: dict) -> None:
    """Raises 403 if the user does not own the session, isn't an admin, and
    doesn't hold a share grant for it. Sessions without an owner (created
    before ownership tracking) remain accessible."""
    if current_user.get("role") == "admin":
        return
    owner = session.get("owner_username")
    username = current_user.get("username")
    if not owner or owner == username:
        return
    if check_session_access(session_id, username) is not None:
        return
    raise HTTPException(status_code=403, detail="Access denied to this session")


def require_session(session_id: str, current_user: dict) -> dict:
    """Single fetch-and-authorise gate for any session_id route (I-06).

    Loads the session (404 if missing) and enforces ownership (403 if not the
    owner, not an admin, and not a share recipient). Centralising both steps
    here means a route that reaches a session through this helper can never
    accidentally skip the owner check. A freshly created, still-unowned
    session passes — upload claims it.
    """
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _verify_session_access(session_id, session, current_user)
    return session


def _require_chat_session(session_id: str, current_user: dict) -> tuple[dict, str, object]:
    """Validate session has a document, enforce ownership, return (session, doc_name, doc_context)."""
    session = session_manager.get_session(session_id)
    if not session or not session.get("vector_store"):
        raise HTTPException(status_code=400, detail="No document uploaded")
    _verify_session_access(session_id, session, current_user)
    doc_name = session.get("document", "")
    username = current_user.get("username", "")
    doc_context = get_document_context(username, doc_name) if doc_name and username else None
    return session, doc_name, doc_context


def _require_image_session(session_id: str, current_user: dict) -> tuple[str, Path]:
    """Validate session has an image document and return (doc_name, image_path).

    Enforces session ownership (I-06) so visual-describe / visual-stream cannot
    read another user's image by session_id."""
    from app.services.vision_service import vision_service as vs
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=400, detail="No document uploaded")
    _verify_session_access(session_id, session, current_user)
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
        _verify_session_access(session_id, session, user)
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
    _verify_session_access(session_id, session, user)
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
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _verify_session_access(session_id, session, user)
    session.pop("conversation_summary", None)
    session_manager.save_session(session_id)
    memory_service.clear_history(session_id)
    return {"status": "cleared"}

_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".webp", ".heic"}


async def _autocheck_compliance(session_id: str, session: dict, username: str,
                                org_id, language: str) -> None:
    """Fire-and-forget НПА compliance check after an upload.

    The eligibility probe hits the DB, so it runs in a thread; the dispatch
    itself must stay on the event loop because it calls asyncio.create_task.
    """
    from app.services import compliance_autocheck
    try:
        eligible = await asyncio.to_thread(
            compliance_autocheck.should_autocheck, session, org_id
        )
        if eligible:
            compliance_autocheck.dispatch(session_id, username, org_id, language)
    except Exception:
        logger.warning("[compliance-auto] post-upload check failed for %s", session_id, exc_info=True)

# ─── Документы ──────────────────────────────────────────

@router.post("/documents/upload")
@limiter.limit(settings.RATE_LIMIT_UPLOAD)
async def upload_document(request: Request, session_id: str, file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    try:
        UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session_id")

    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    # A user must not upload into another user's session (I-06). An unowned,
    # freshly created session passes and is claimed below (owner_username set).
    _verify_session_access(session_id, session, user)

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

    # Writing up to 100 MB and sniffing its MIME are blocking I/O — run them on
    # the ingest pool so active SSE streams don't freeze for the duration.
    loop = asyncio.get_running_loop()

    def _save_and_validate():
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return validate_mime(file_path)

    ok, detected_mime = await loop.run_in_executor(doc_executor, _save_and_validate)
    if not ok:
        file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=415, detail=f"File content does not match its extension (detected: {detected_mime})")

    try:
        # Offload the blocking Docling conversion + embedding onto the dedicated
        # ingest pool so a large upload never blocks the event loop for everyone.
        vector_store, markdown_text, html_text = await loop.run_in_executor(
            doc_executor, doc_processor.process_file, str(file_path), session_id
        )
        # Document changed on disk → drop any stale cached BM25 index for this session.
        from app.services import bm25_cache
        bm25_cache.invalidate(session_id)
        session["document"] = safe_name
        session["vector_store"] = True
        session["preview"] = markdown_text[:800]
        session["markdown_text"] = markdown_text
        # HTML preview goes to disk (uploads/{session_id}/preview.html), not RAM/DB.
        await asyncio.to_thread(session_manager.store_html, session_id, html_text)
        session["owner_username"] = user.get("username")
        session_manager.save_session(session_id)
        _username = user.get("username")
        _org_id = session.get("org_id") or analytics_service.resolve_org_id(_username)
        # Queue the automatic НПА compliance check (background agent lane).
        asyncio.create_task(_autocheck_compliance(
            session_id, session, _username, _org_id,
            request.headers.get("x-language", "ru"),
        ))
        asyncio.create_task(asyncio.to_thread(
            analytics_service.log_event, "upload",
            username=_username, session_id=session_id,
            file_format=ext.lstrip(".").upper(),
            org_id=_org_id,
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
    except DocumentTooLargeError as e:
        # Full text was never stored (rejected inside process_file) — drop the saved file too.
        file_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=413,
            detail=f"Документ слишком большой: {e.chars:,} символов "
                   f"(максимум {e.limit:,}). Разделите файл и загрузите частями.",
        )
    except HTTPException:
        raise
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
    # Resolve the caller from either auth path, then enforce session ownership
    # (I-06) — a valid token alone must not grant another session's image.
    user = bearer_user
    if user is None:
        if not token:
            raise HTTPException(status_code=401, detail="Not authenticated")
        user = verify_token(token)

    session = require_session(session_id, user)
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
    doc_name, image_path = _require_image_session(session_id, user)
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
    _, image_path = _require_image_session(session_id, user)

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
@limiter.limit(settings.RATE_LIMIT_CHAT)
async def chat(request: Request, body: ChatRequest, user: dict = Depends(get_current_user)):
    _, _, doc_context = _require_chat_session(body.session_id, user)
    history = memory_service.get_history(body.session_id, limit=10)
    language = body.language or request.headers.get("x-language", "ru")

    from app.services import ai_settings_service
    token = ai_settings_service.set_current_username(user.get("username"))
    try:
        answer = await asyncio.to_thread(
            llm_service.chat, body.question, body.session_id, doc_context, history, language=language
        )
        memory_service.add_message(body.session_id, "user", body.question)
        memory_service.add_message(body.session_id, "assistant", answer)
        return ChatResponse(answer=answer, session_id=body.session_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        ai_settings_service.reset_current_username(token)

# ─── Стриминг чата ──────────────────────────────────────

@router.get("/chat/stream")
@limiter.limit(settings.RATE_LIMIT_CHAT)
async def chat_stream(
    request: Request,
    session_id: str,
    question: str,
    mode: str = "precise",
    language: str = "ru",
    user: dict = Depends(get_current_user),
):
    _, _, doc_context = _require_chat_session(session_id, user)
    username = user.get("username")

    # Task 3: reject a second concurrent generation from the same user with
    # a clear, actionable message instead of silently queuing/hanging.
    if generation_registry.count_active_for_user(username) >= settings.LLM_MAX_CONCURRENT_PER_USER:
        raise HTTPException(
            status_code=429,
            detail="У вас уже выполняется генерация. Дождитесь завершения или остановите текущий запрос.",
        )

    history = memory_service.get_history(session_id, limit=10)
    lang = language or request.headers.get("x-language", "ru")

    _THINK_OPEN = "<think>"
    _THINK_CLOSE = "</think>"

    async def generate():
        gen_task = asyncio.current_task()
        generation_registry.register(session_id, username, gen_task)
        from app.services import ai_settings_service
        prompt_user_token = ai_settings_service.set_current_username(username)
        logger.info(
            "[chat_stream] start session=%s user=%s mode=%s question=%r",
            session_id, username, mode, question[:120],
        )
        yield f"data: {json.dumps({'status': 'Ищу релевантные фрагменты...'})}\n\n"
        full_answer: list[str] = []
        retrieved_docs = []
        cancelled = False
        disconnected_flag = asyncio.Event()

        async def _watch_disconnect():
            # Task 5: backend-side liveness check — if the client tab/connection
            # is gone, cancel the generation via the same path as
            # POST /api/chat/cancel/{session_id} instead of streaming forever.
            try:
                while True:
                    await asyncio.sleep(settings.LLM_DISCONNECT_POLL_SEC)
                    if await request.is_disconnected():
                        disconnected_flag.set()
                        gen_task.cancel()
                        return
            except asyncio.CancelledError:
                return

        watcher = asyncio.create_task(_watch_disconnect())
        try:
            # Retrieve docs first so we can emit citations at the end
            retrieved_docs, context = await llm_service.retrieve_docs_and_context(
                question, session_id, doc_context, mode
            )
            logger.info(
                "[chat_stream] retrieval done session=%s docs=%d",
                session_id, len(retrieved_docs),
            )
            first = True
            in_think = False
            thinking_notified = False
            pending = ""
            async for chunk in llm_service.chat_astream(
                question, session_id, mode=mode, history=history,
                prebuilt_context=context, language=lang,
            ):
                if first:
                    logger.info("[chat_stream] first chunk received session=%s", session_id)
                    yield f"data: {json.dumps({'status': 'Формирую ответ...'})}\n\n"
                    first = False
                if not chunk:
                    continue
                # Reasoning models (e.g. qwen3.5) wrap "thinking" in <think>...</think>
                # inline in the token stream. react-markdown (without rehype-raw)
                # silently drops that raw HTML, so without stripping it here the
                # chat bubble can stay empty even though tokens are arriving.
                pending += chunk
                visible = ""
                while pending:
                    if in_think:
                        idx = pending.find(_THINK_CLOSE)
                        if idx == -1:
                            pending = pending[-(len(_THINK_CLOSE) - 1):]
                            break
                        pending = pending[idx + len(_THINK_CLOSE):]
                        in_think = False
                    else:
                        idx = pending.find(_THINK_OPEN)
                        if idx == -1:
                            keep = len(_THINK_OPEN) - 1
                            if len(pending) > keep:
                                visible += pending[:-keep]
                                pending = pending[-keep:]
                            break
                        visible += pending[:idx]
                        pending = pending[idx + len(_THINK_OPEN):]
                        in_think = True
                        if not thinking_notified:
                            logger.info("[chat_stream] entered <think> block session=%s", session_id)
                            yield f"data: {json.dumps({'status': 'Модель размышляет...'})}\n\n"
                            thinking_notified = True
                if visible:
                    full_answer.append(visible)
                    yield f"data: {json.dumps({'text': visible})}\n\n"

            # Flush any trailing text that was held back while scanning for a
            # possible <think> tag but never matched one.
            if pending and not in_think:
                full_answer.append(pending)
                yield f"data: {json.dumps({'text': pending})}\n\n"

            # The model spent its whole context budget "thinking" and never
            # closed </think> / produced visible output — surface an
            # actionable message instead of leaving the bubble empty.
            if in_think and not full_answer:
                logger.warning(
                    "[chat_stream] session=%s ended inside <think> with no visible output",
                    session_id,
                )
                fallback = (
                    "Модель слишком долго размышляла и не успела сформировать ответ "
                    "в пределах контекста. Попробуйте сформулировать вопрос короче "
                    "или повторите запрос."
                )
                full_answer.append(fallback)
                yield f"data: {json.dumps({'text': fallback})}\n\n"
        except asyncio.CancelledError:
            # Task 1: cancelled via POST /api/chat/cancel/{session_id}, or
            # Task 5: client disconnected (disconnected_flag set above).
            # Do not yield further — the generator is being torn down.
            cancelled = True
            if not disconnected_flag.is_set():
                raise
        except Exception as e:
            logger.exception("[chat_stream] error session=%s", session_id)
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            watcher.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await watcher
            if not cancelled:
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
                answer_text = "".join(full_answer)
                if cancelled:
                    suffix = "_[Соединение прервано]_" if disconnected_flag.is_set() else "_[Остановлено пользователем]_"
                    answer_text += f"\n\n{suffix}"
                memory_service.add_message(session_id, "assistant", answer_text)
                logger.info(
                    "[chat_stream] done session=%s chars=%d cancelled=%s",
                    session_id, len(answer_text), cancelled,
                )
                asyncio.create_task(asyncio.to_thread(
                    analytics_service.log_event, "chat",
                    username=username, session_id=session_id, mode=mode,
                    org_id=analytics_service.resolve_org_id(username),
                ))
            else:
                logger.info(
                    "[chat_stream] done session=%s empty answer cancelled=%s",
                    session_id, cancelled,
                )
            generation_registry.finish(session_id)
            ai_settings_service.reset_current_username(prompt_user_token)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── Отмена и статус генерации (Task 1 / Task 4) ─────────


@router.post("/chat/cancel/{session_id}")
async def cancel_generation(session_id: str, request: Request, user: dict = Depends(get_current_user)):
    """Cancels the active streaming generation for this session (if any).

    Cancels the underlying asyncio.Task, which propagates CancelledError
    through chat_astream — releasing the LLM semaphore and queue slot via
    their existing finally blocks — and frees the user's concurrency slot
    (Task 3) so a new generation can start immediately.
    """
    is_admin = user.get("role") == "admin"
    result = generation_registry.cancel(session_id, user.get("username"), is_admin=is_admin)
    if result == "not_found":
        return {"status": "idle", "message": "Нет активной генерации для этой сессии"}
    if result == "forbidden":
        raise HTTPException(status_code=403, detail="Access denied to this session")

    asyncio.create_task(asyncio.to_thread(
        audit_service.log, "chat_cancel",
        username=user.get("username"),
        session_id=session_id,
        ip_address=getattr(request.client, "host", None) if request.client else None,
    ))
    return {"status": "cancelled"}


@router.get("/chat/status/{session_id}")
async def generation_status(session_id: str, user: dict = Depends(get_current_user)):
    """Queue/monitoring snapshot for a session (Task 4): status, queue
    position, active generation count, queue depth and estimated wait."""
    return generation_registry.get_status(session_id)


# ─── Содержимое документа ───────────────────────────────

@router.get("/documents/{session_id}/content")
async def get_document_content(session_id: str, user: dict = Depends(get_current_user)):
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _verify_session_access(session_id, session, user)
    html = await asyncio.to_thread(session_manager.load_html, session_id)
    return {
        "filename": session.get("document", ""),
        "markdown": session.get("markdown_text", ""),
        "html": html,
        "char_count": len(session.get("markdown_text") or ""),
    }

# ─── Перевод ────────────────────────────────────────────

# Documents above this size must go through the background translation job
# (POST /api/translations): a sync request would occupy LLM slots for many
# minutes and risk hitting the nginx request timeout.
_TRANSLATE_SYNC_MAX_CHARS = 60_000


def _reject_oversized_sync_translation(markdown_text: str) -> None:
    if len(markdown_text) > _TRANSLATE_SYNC_MAX_CHARS:
        raise HTTPException(
            status_code=413,
            detail=(
                f"Документ слишком большой для синхронного перевода "
                f"({len(markdown_text):,} символов, максимум {_TRANSLATE_SYNC_MAX_CHARS:,}). "
                f"Используйте фоновый перевод (POST /api/translations) — прогресс "
                f"отображается в панели переводов."
            ),
        )


@router.post("/translate")
@limiter.limit(settings.RATE_LIMIT_TRANSLATE)
async def translate_document(request: Request, body: TranslateRequest, user: dict = Depends(get_current_user)):
    """Переводит содержимое документа на kz / ru / en"""
    session = session_manager.get_session(body.session_id)
    if not session or not session.get("vector_store"):
        raise HTTPException(status_code=400, detail="No document uploaded")
    _verify_session_access(body.session_id, session, user)
    markdown_text = session.get("markdown_text", "")
    if not markdown_text:
        raise HTTPException(status_code=400, detail="Document text not found, please re-upload")
    _reject_oversized_sync_translation(markdown_text)
    try:
        # Parallel chunk translation (max 2 concurrent) — faster than the sequential
        # sync path and keeps large docs within the nginx 1800s request timeout.
        translated = await translation_service.translate_document_async(
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
@limiter.limit(settings.RATE_LIMIT_EXPORT)
async def translate_export(request: Request, body: TranslateRequest, target_format: Literal["txt", "md", "docx", "pdf"], user: dict = Depends(get_current_user)):
    """Переводит документ и сразу экспортирует в формат для скачивания"""
    session = session_manager.get_session(body.session_id)
    if not session or not session.get("vector_store"):
        raise HTTPException(status_code=400, detail="No document uploaded")
    _verify_session_access(body.session_id, session, user)

    markdown_text = session.get("markdown_text", "")
    if not markdown_text:
        raise HTTPException(status_code=400, detail="Document text not found, please re-upload")
    _reject_oversized_sync_translation(markdown_text)
    try:
        # 1. Сначала переводим (параллельный по чанкам путь, см. /translate выше)
        translated_text = await translation_service.translate_document_async(
            markdown_text, body.target_language
        )

        # 2. Сохраняем в файл нужного формата
        output_filename = f"translated_{body.target_language}"
        output_path = Path(f"{settings.UPLOAD_DIR}/{body.session_id}/{output_filename}{converter_service.FORMAT_EXTENSIONS[target_format]}")

        await asyncio.to_thread(
            converter_service.text_to_format,
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
@limiter.limit(settings.RATE_LIMIT_CONVERT)
async def convert_document(request: Request, session_id: str, target_format: Literal["txt", "md", "docx", "pdf"], user: dict = Depends(get_current_user)):
    """Конвертирует документ в txt / md / docx / pdf"""
    session = session_manager.get_session(session_id)
    if not session or not session.get("vector_store"):
        raise HTTPException(status_code=400, detail="No document uploaded")
    _verify_session_access(session_id, session, user)
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

    # Enforce session ownership before serving the converted/translated file (I-06).
    require_session(session_id, user)

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
    _verify_session_access(session_id, session, current_user)
    session["markdown_text"] = body.markdown
    session_manager.save_session(session_id)
    return {"ok": True}


class ExportMarkdownRequest(BaseModel):
    session_id: str
    markdown: str
    format: Literal["docx", "pdf"] = "docx"


@router.post("/documents/export-markdown")
@limiter.limit(settings.RATE_LIMIT_CONVERT)
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
        await asyncio.to_thread(_markdown_to_docx, body.markdown, output_path, llm_service=llm_service)
    else:
        from app.services.converter import _text_to_pdf
        await asyncio.to_thread(_text_to_pdf, body.markdown, output_path)

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
