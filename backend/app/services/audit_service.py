"""Append-only audit trail for security-relevant user actions.

Usage (fire-and-forget, non-blocking):
    asyncio.create_task(asyncio.to_thread(
        audit_service.log,
        action="upload",
        username=user["username"],
        org_id=org_id,
        session_id=session_id,
        document_name=doc_name,
        ip_address=request.client.host,
    ))
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_VALID_ACTIONS = frozenset({"upload", "view", "briefing_view", "export", "delete", "chat_cancel"})


def log(
    action: str,
    username: Optional[str] = None,
    org_id: Optional[int] = None,
    session_id: Optional[str] = None,
    document_name: Optional[str] = None,
    ip_address: Optional[str] = None,
    result: str = "success",
    detail: Optional[dict] = None,
) -> None:
    """Write one audit event row. Silently skips on DB error — never raises."""
    if action not in _VALID_ACTIONS:
        logger.warning("[audit] unknown action %r — skipped", action)
        return
    try:
        from app.core.database import SessionLocal
        from app.models.models import AuditEvent
        with SessionLocal() as db:
            db.add(AuditEvent(
                action=action,
                result=result,
                username=username,
                org_id=org_id,
                session_id=session_id,
                document_name=document_name,
                ip_address=ip_address,
                detail=detail,
            ))
            db.commit()
    except Exception as e:
        logger.error("[audit] failed to write event action=%s user=%s: %s", action, username, e)
