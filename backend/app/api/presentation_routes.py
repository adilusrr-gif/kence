from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from pathlib import Path
from typing import List, Optional
import asyncio
import json

from app.core.session import session_manager
from app.core.config import get_settings
from app.api.auth_routes import get_current_user
from app.api.routes import _verify_session_access
from app.services.presentation_plan import (
    generate_plan, save_plan, get_plan, THEMES, SLIDE_TYPES
)
from app.services.presentation_builder import build_presentation
from app.services.llm import llm_service
from app.services import analytics_service

router = APIRouter()
settings = get_settings()


class PlanRequest(BaseModel):
    session_id: str
    user_instructions: str = ""
    num_slides: int = Field(default=6, ge=2, le=12)


class PlanUpdateRequest(BaseModel):
    slides: list
    title: Optional[str] = None


class BuildRequest(BaseModel):
    theme: str = "corporate"
    slide_ids: List[str]


@router.post("/plan")
async def create_plan(body: PlanRequest, user: dict = Depends(get_current_user)):
    session = session_manager.get_session(body.session_id)
    if not session or not session.get("vector_store"):
        raise HTTPException(status_code=400, detail="No document uploaded")
    _verify_session_access(body.session_id, session, user)
    try:
        plan = await asyncio.to_thread(
            generate_plan, body.session_id, llm_service, body.user_instructions, body.num_slides
        )
        return plan
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/plan")
async def update_plan(session_id: str, body: PlanUpdateRequest, user: dict = Depends(get_current_user)):
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _verify_session_access(session_id, session, user)
    existing = get_plan(session_id) or {}
    plan = {
        "title": body.title or existing.get("title", ""),
        "slides": body.slides,
    }
    saved = save_plan(session_id, plan)
    return saved


@router.post("/build")
async def build(session_id: str, body: BuildRequest, user: dict = Depends(get_current_user)):
    session = session_manager.get_session(session_id)
    if not session or not session.get("vector_store"):
        raise HTTPException(status_code=400, detail="No document uploaded")
    _verify_session_access(session_id, session, user)
    plan = get_plan(session_id)
    if not plan:
        raise HTTPException(status_code=400, detail="No plan found — call POST /plan first")
    try:
        path = await asyncio.to_thread(
            build_presentation, plan, body.theme, body.slide_ids, session_id, llm_service
        )
        _u = user.get("username")
        asyncio.create_task(asyncio.to_thread(
            analytics_service.log_event, "presentation",
            username=_u, session_id=session_id, theme=body.theme,
            org_id=analytics_service.resolve_org_id(_u),
        ))
        return {
            "status": "built",
            "download_url": f"/api/presentations/download/{session_id}",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/build/stream")
async def build_stream(
    request: Request,
    session_id: str,
    theme: str = "corporate",
    slide_ids: str = "",
    user: dict = Depends(get_current_user),
):
    """SSE endpoint — streams build progress, yields [DONE] when finished."""
    session = session_manager.get_session(session_id)
    if not session or not session.get("vector_store"):
        raise HTTPException(status_code=400, detail="No document uploaded")
    _verify_session_access(session_id, session, user)
    plan = get_plan(session_id)
    if not plan:
        raise HTTPException(status_code=400, detail="No plan found — call POST /plan first")

    ids = [s for s in slide_ids.split(",") if s]

    queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_running_loop()

    def progress_cb(event: dict):
        loop.call_soon_threadsafe(queue.put_nowait, event)

    async def run_build():
        try:
            await asyncio.to_thread(
                build_presentation, plan, theme, ids, session_id, llm_service, progress_cb
            )
            await queue.put({"done": True, "download_url": f"/api/presentations/download/{session_id}"})
        except Exception as exc:
            await queue.put({"error": str(exc)})

    asyncio.create_task(run_build())

    async def generate():
        yield f"data: {json.dumps({'status': 'Подготовка…'})}\n\n"
        while True:
            if await request.is_disconnected():
                break
            try:
                event = await asyncio.wait_for(queue.get(), timeout=60.0)
            except asyncio.TimeoutError:
                yield f"data: {json.dumps({'error': 'Timeout'})}\n\n"
                break
            if "error" in event:
                yield f"data: {json.dumps({'error': event['error']})}\n\n"
                break
            if event.get("done"):
                yield f"data: {json.dumps({'done': True, 'download_url': event['download_url']})}\n\n"
                break
            yield f"data: {json.dumps(event)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/download/{session_id}")
async def download(session_id: str, user: dict = Depends(get_current_user)):
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _verify_session_access(session_id, session, user)
    path = Path(settings.UPLOAD_DIR) / session_id / "presentation_v2.pptx"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Presentation not found. Build it first.")
    return FileResponse(
        str(path),
        filename="presentation.pptx",
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
    )


@router.get("/themes")
async def get_themes(user: dict = Depends(get_current_user)):
    return {"themes": {k: v for k, v in THEMES.items()}, "slide_types": SLIDE_TYPES}
