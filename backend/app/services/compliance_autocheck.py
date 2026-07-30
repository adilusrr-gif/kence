"""Automatic НПА compliance check on document upload.

Every uploaded document is queued for a background "compliance" agent run
against the organisation's НПА library (DocumentLibrary rows with
doc_kind='npa'). The check reuses the existing agent infrastructure end to end
— AgentTask row, orchestrator dispatch, SSE stream, startup requeue — so the
result shows up wherever agent results already do, and the frontend reads it
back via GET /api/agents/tasks/by-session.

Dispatch is best-effort and never blocks or fails an upload: the document is
already safely ingested by the time we get here, and a missing compliance run
is recoverable by launching the agent manually.
"""
import logging
from typing import Optional

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.models.models import AgentTask, DocumentLibrary

logger = logging.getLogger(__name__)

_TASK_TYPE = "compliance"


def _org_has_npa(org_id: int) -> bool:
    """True when the org has at least one НПА to check against.

    Without this the agent would immediately fail with "Не найдено НПА в
    библиотеке" on every upload for orgs that never populated the library,
    filling the task list with noise.
    """
    with SessionLocal() as db:
        return db.query(DocumentLibrary.id).filter(
            DocumentLibrary.org_id == org_id,
            DocumentLibrary.doc_kind == "npa",
        ).first() is not None


def should_autocheck(session: dict, org_id: Optional[int], library_doc_id: Optional[int] = None) -> bool:
    """Decide whether an uploaded document warrants an automatic compliance run."""
    settings = get_settings()
    if not settings.AUTO_COMPLIANCE_CHECK or not org_id:
        return False
    # An НПА being added to the library must not be checked against itself.
    if library_doc_id is not None:
        return False
    text = session.get("markdown_text") or ""
    if len(text) < settings.AUTO_COMPLIANCE_MIN_CHARS:
        return False
    try:
        return _org_has_npa(org_id)
    except Exception as e:
        logger.warning("[compliance-auto] НПА lookup failed for org %s: %s", org_id, e)
        return False


def dispatch(session_id: str, username: str, org_id: int, language: str = "ru") -> Optional[int]:
    """Create + dispatch the background compliance AgentTask. Returns its id.

    Mirrors agent_routes.create_task so the task is indistinguishable from a
    manually launched one (same registry, same requeue-after-restart handling).
    """
    input_data = {
        "session_id": session_id,
        "org_id": org_id,
        "language": language,
        "library_doc_ids": None,
        "direction": None,
        "auto": True,
    }
    try:
        with SessionLocal() as db:
            task = AgentTask(
                org_id=org_id,
                username=username,
                task_type=_TASK_TYPE,
                session_id=session_id,
                input_data=input_data,
                steps=[],
            )
            db.add(task)
            db.commit()
            db.refresh(task)
            task_id = task.id

        from app.api.agent_routes import _dispatch_agent_task
        _dispatch_agent_task(task_id, _TASK_TYPE, input_data, org_id, username)
        logger.info("[compliance-auto] queued task %s for session %s", task_id, session_id)
        return task_id
    except Exception as e:
        # Never surface to the uploader — the document itself uploaded fine.
        logger.warning("[compliance-auto] dispatch failed for session %s: %s", session_id, e)
        return None


def maybe_dispatch(session_id: str, session: dict, username: str,
                   org_id: Optional[int], language: str = "ru",
                   library_doc_id: Optional[int] = None) -> Optional[int]:
    """should_autocheck + dispatch. Safe to call fire-and-forget from a route."""
    if not should_autocheck(session, org_id, library_doc_id):
        return None
    return dispatch(session_id, username, org_id, language)
