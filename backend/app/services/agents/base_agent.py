"""Base agent infrastructure using LangGraph."""
import json
import logging
from datetime import datetime, timezone
from typing import TypedDict, Optional, Any
from app.core.database import SessionLocal
from app.models.models import AgentTask

logger = logging.getLogger(__name__)


class AgentState(TypedDict):
    session_id: Optional[str]
    org_id: Optional[int]
    username: str
    task_id: int
    question: Optional[str]
    instructions: Optional[str]
    context: Optional[str]
    graph_context: Optional[str]
    history: list
    steps: list
    result: Optional[Any]
    error: Optional[str]


def emit_step(task_id: int, step_name: str, status: str, detail: str = "", chunk: str = "") -> None:
    """Append a step event to AgentTask.steps in DB for SSE consumption."""
    event = {
        "step": step_name,
        "status": status,
        "detail": detail,
        "chunk": chunk,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    try:
        with SessionLocal() as db:
            task = db.query(AgentTask).filter_by(id=task_id).first()
            if task:
                steps = list(task.steps or [])
                steps.append(event)
                task.steps = steps
                db.commit()
    except Exception as e:
        logger.error("emit_step error: %s", e)


def update_task_status(task_id: int, status: str, output_data: Any = None, error: str = None) -> None:
    try:
        with SessionLocal() as db:
            task = db.query(AgentTask).filter_by(id=task_id).first()
            if task:
                task.status = status
                if output_data is not None:
                    task.output_data = output_data
                if error:
                    task.error = error
                if status == "running" and not task.started_at:
                    task.started_at = datetime.now(timezone.utc)
                if status in ("done", "failed", "cancelled"):
                    task.finished_at = datetime.now(timezone.utc)
                db.commit()
    except Exception as e:
        logger.error("update_task_status error: %s", e)
