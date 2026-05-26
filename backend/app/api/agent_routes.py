import asyncio
from datetime import datetime, timezone
from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.api.auth_routes import get_current_user
from app.core.database import SessionLocal
from app.models.models import AgentTask
from app.services.agents import AGENT_TYPES

router = APIRouter(prefix="/agents", tags=["agents"])


class CreateTaskRequest(BaseModel):
    task_type: str
    org_id: Optional[int] = None
    session_id: Optional[str] = None
    question: Optional[str] = None
    instructions: Optional[str] = None


@router.get("/types")
async def list_agent_types(current_user: dict = Depends(get_current_user)):
    return AGENT_TYPES


@router.post("/tasks")
async def create_task(req: CreateTaskRequest, current_user: dict = Depends(get_current_user)):
    if req.task_type not in AGENT_TYPES:
        raise HTTPException(status_code=400, detail=f"Неизвестный тип агента: {req.task_type}")

    input_data = {
        "session_id": req.session_id,
        "question": req.question,
        "instructions": req.instructions,
        "org_id": req.org_id,
    }

    with SessionLocal() as db:
        task = AgentTask(
            org_id=req.org_id,
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
    asyncio.create_task(
        run_agent_task(task_id, req.task_type, input_data, req.org_id, current_user["username"])
    )

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
    return {"message": "Задание отменено"}


@router.get("/tasks/{task_id}/stream")
async def stream_task(task_id: int, current_user: dict = Depends(get_current_user)):
    """SSE stream of agent step events. Polls AgentTask.steps every 0.5s."""
    import json

    async def event_generator():
        last_step_index = 0
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

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
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
