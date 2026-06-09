import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Any
from app.core.limiter import limiter
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel


from app.api.auth_routes import get_current_user, verify_token, oauth2_scheme
from app.core.config import get_settings
from app.core.database import SessionLocal
from app.models.models import AgentTask
from app.services.agents import AGENT_TYPES

router = APIRouter(prefix="/agents", tags=["agents"])

# Keeps strong references to running agent asyncio.Tasks so CPython GC cannot
# collect them before they finish. Cleaned up via add_done_callback.
_task_registry: dict[int, asyncio.Task] = {}


class CreateTaskRequest(BaseModel):
    task_type: str
    org_id: Optional[int] = None
    session_id: Optional[str] = None
    question: Optional[str] = None
    instructions: Optional[str] = None
    language: Optional[str] = None


@router.get("/types")
async def list_agent_types(current_user: dict = Depends(get_current_user)):
    return AGENT_TYPES


@router.post("/tasks")
@limiter.limit("20/minute")
async def create_task(request: Request, req: CreateTaskRequest, current_user: dict = Depends(get_current_user)):
    if req.task_type not in AGENT_TYPES:
        raise HTTPException(status_code=400, detail=f"Неизвестный тип агента: {req.task_type}")

    input_data = {
        "session_id": req.session_id,
        "question": req.question,
        "instructions": req.instructions,
        "org_id": req.org_id,
        "language": req.language or request.headers.get("x-language", "ru"),
    }

    # Resolve org_id — fall back to user's first org, then default org
    org_id = req.org_id
    if not org_id:
        from app.services.org_service import get_user_orgs, ensure_default_org
        orgs = get_user_orgs(current_user["username"])
        if orgs:
            org_id = orgs[0]["id"]
        else:
            try:
                org_id = ensure_default_org()["id"]
            except Exception:
                pass
    if not org_id:
        raise HTTPException(status_code=400, detail="Не удалось определить организацию. Убедитесь, что вы состоите в организации.")

    with SessionLocal() as db:
        task = AgentTask(
            org_id=org_id,
            username=current_user["username"],
            task_type=req.task_type,
            input_data=input_data,
            steps=[],
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        task_id = task.id

    from app.services.agents.orchestrator import run_agent_task
    from app.services import analytics_service
    t = asyncio.create_task(
        run_agent_task(task_id, req.task_type, input_data, org_id, current_user["username"])
    )
    _task_registry[task_id] = t
    t.add_done_callback(lambda _: _task_registry.pop(task_id, None))

    asyncio.create_task(asyncio.to_thread(
        analytics_service.log_event, "agent_task",
        username=current_user["username"],
        session_id=req.session_id,
        org_id=org_id,
        task_type=req.task_type,
    ))

    return {"task_id": task_id, "status": "queued"}


@router.get("/tasks")
async def list_tasks(
    org_id: Optional[int] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    with SessionLocal() as db:
        q = db.query(AgentTask).filter_by(username=current_user["username"])
        if org_id:
            q = q.filter_by(org_id=org_id)
        tasks = q.order_by(AgentTask.created_at.desc()).limit(limit).all()
        return [_task_to_dict(t) for t in tasks]


@router.get("/tasks/{task_id}")
async def get_task(task_id: int, current_user: dict = Depends(get_current_user)):
    with SessionLocal() as db:
        task = db.query(AgentTask).filter_by(id=task_id, username=current_user["username"]).first()
        if not task:
            raise HTTPException(status_code=404, detail="Задание не найдено")
        return _task_to_dict(task, include_steps=True)


@router.delete("/tasks/{task_id}")
async def cancel_task(task_id: int, current_user: dict = Depends(get_current_user)):
    with SessionLocal() as db:
        task = db.query(AgentTask).filter_by(id=task_id, username=current_user["username"]).first()
        if not task:
            raise HTTPException(status_code=404, detail="Задание не найдено")
        if task.status in ("done", "failed"):
            raise HTTPException(status_code=400, detail="Задание уже завершено")
        task.status = "cancelled"
        task.finished_at = datetime.now(timezone.utc)
        db.commit()

    # Cancel the actual asyncio task if it is still running
    running = _task_registry.pop(task_id, None)
    if running and not running.done():
        running.cancel()

    return {"message": "Задание отменено"}


@router.get("/tasks/{task_id}/stream")
async def stream_task(
    task_id: int,
    token: Optional[str] = Query(None),
    bearer: Optional[str] = Depends(oauth2_scheme),
):
    """SSE stream of agent step events. Polls AgentTask.steps every 0.5s."""
    raw = bearer or token
    if not raw:
        raise HTTPException(status_code=401, detail="Not authenticated")
    current_user = verify_token(raw)
    import json

    async def event_generator():
        last_step_index = 0
        try:
            while True:
                await asyncio.sleep(0.5)
                with SessionLocal() as db:
                    task = db.query(AgentTask).filter_by(id=task_id, username=current_user["username"]).first()
                    if not task:
                        yield "data: {\"error\": \"Task not found\"}\n\n"
                        return

                    steps = task.steps or []
                    for step in steps[last_step_index:]:
                        yield f"data: {json.dumps(step, ensure_ascii=False)}\n\n"
                        last_step_index += 1

                    if task.status in ("done", "failed", "cancelled"):
                        final = {
                            "step": "done",
                            "status": task.status,
                            "result": task.output_data,
                            "error": task.error,
                        }
                        yield f"data: {json.dumps(final, ensure_ascii=False)}\n\n"
                        yield "data: [DONE]\n\n"
                        return
        except asyncio.CancelledError:
            return

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/tasks/{task_id}/download")
async def download_task_result(
    task_id: int,
    token: Optional[str] = Query(None),
    bearer: Optional[str] = Depends(oauth2_scheme),
):
    """Download the edited document produced by the document_editor agent."""
    from fastapi.responses import FileResponse
    raw = bearer or token
    if not raw:
        raise HTTPException(status_code=401, detail="Not authenticated")
    current_user = verify_token(raw)
    with SessionLocal() as db:
        task = db.query(AgentTask).filter_by(id=task_id, username=current_user["username"]).first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        output = task.output_data or {}
        raw_path = output.get("download_path")
        if not raw_path:
            raise HTTPException(status_code=404, detail="No downloadable file for this task")

        # Path traversal guard: resolved path must be inside UPLOAD_DIR
        settings = get_settings()
        safe_base = Path(settings.UPLOAD_DIR).resolve()
        actual_path = Path(raw_path).resolve()
        if not actual_path.is_relative_to(safe_base):
            raise HTTPException(status_code=403, detail="Invalid file path")
        if not actual_path.exists():
            raise HTTPException(status_code=404, detail="File not found on disk")

        return FileResponse(
            path=str(actual_path),
            filename="edited_document.docx",
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )


def _task_to_dict(task: AgentTask, include_steps: bool = False) -> dict:
    d = {
        "id": task.id,
        "org_id": task.org_id,
        "username": task.username,
        "task_type": task.task_type,
        "status": task.status,
        "input_data": task.input_data,
        "output_data": task.output_data,
        "error": task.error,
        "started_at": task.started_at.isoformat() if task.started_at else None,
        "finished_at": task.finished_at.isoformat() if task.finished_at else None,
        "created_at": task.created_at.isoformat() if task.created_at else None,
    }
    if include_steps:
        d["steps"] = task.steps or []
    return d
