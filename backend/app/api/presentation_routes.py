from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from pathlib import Path
from typing import List, Optional

from app.core.session import session_manager
from app.core.config import get_settings
from app.api.auth_routes import get_current_user
from app.services.presentation_plan import (
    generate_plan, save_plan, get_plan, THEMES, SLIDE_TYPES
)
from app.services.presentation_builder import build_presentation
from app.services.llm import llm_service

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
    try:
        plan = generate_plan(body.session_id, llm_service, body.user_instructions, body.num_slides)
        return plan
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/plan")
async def update_plan(session_id: str, body: PlanUpdateRequest, user: dict = Depends(get_current_user)):
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
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
    plan = get_plan(session_id)
    if not plan:
        raise HTTPException(status_code=400, detail="No plan found — call POST /plan first")
    try:
        path = build_presentation(plan, body.theme, body.slide_ids, session_id, llm_service)
        return {
            "status": "built",
            "download_url": f"/api/presentations/download/{session_id}",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download/{session_id}")
async def download(session_id: str, user: dict = Depends(get_current_user)):
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
