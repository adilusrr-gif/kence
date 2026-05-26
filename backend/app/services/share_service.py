from typing import Optional
from datetime import datetime
from app.core.database import SessionLocal
from app.models.models import WorkspaceShare
from fastapi import HTTPException


def share_session(
    session_id: str,
    shared_by: str,
    org_id: int,
    permission: str = "view",
    shared_with: Optional[str] = None,
    expires_at: Optional[datetime] = None,
) -> dict:
    with SessionLocal() as db:
        existing = db.query(WorkspaceShare).filter_by(
            session_id=session_id,
            shared_with=shared_with,
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="Сессия уже передана этому пользователю")
        share = WorkspaceShare(
            session_id=session_id,
            shared_by=shared_by,
            shared_with=shared_with,
            org_id=org_id,
            permission=permission,
            expires_at=expires_at,
        )
        db.add(share)
        db.commit()
        db.refresh(share)
        return _share_to_dict(share)


def get_session_shares(session_id: str) -> list[dict]:
    with SessionLocal() as db:
        shares = db.query(WorkspaceShare).filter_by(session_id=session_id).all()
        return [_share_to_dict(s) for s in shares]


def revoke_share(share_id: int, requester: str) -> bool:
    with SessionLocal() as db:
        share = db.query(WorkspaceShare).filter_by(id=share_id).first()
        if not share:
            return False
        if share.shared_by != requester:
            raise HTTPException(status_code=403, detail="Только владелец может отозвать доступ")
        db.delete(share)
        db.commit()
        return True


def get_sessions_shared_with(username: str, org_id: int) -> list[dict]:
    with SessionLocal() as db:
        from sqlalchemy import or_
        shares = (
            db.query(WorkspaceShare)
            .filter(
                WorkspaceShare.org_id == org_id,
                or_(
                    WorkspaceShare.shared_with == username,
                    WorkspaceShare.shared_with == None,  # org-wide share
                ),
            )
            .all()
        )
        return [_share_to_dict(s) for s in shares]


def check_session_access(session_id: str, username: str) -> Optional[str]:
    """Returns permission level ('view'|'edit'|'comment') or None."""
    with SessionLocal() as db:
        from sqlalchemy import or_
        share = (
            db.query(WorkspaceShare)
            .filter(
                WorkspaceShare.session_id == session_id,
                or_(
                    WorkspaceShare.shared_with == username,
                    WorkspaceShare.shared_with == None,
                ),
            )
            .first()
        )
        return share.permission if share else None


def _share_to_dict(s: WorkspaceShare) -> dict:
    return {
        "id": s.id,
        "session_id": s.session_id,
        "shared_by": s.shared_by,
        "shared_with": s.shared_with,
        "org_id": s.org_id,
        "permission": s.permission,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "expires_at": s.expires_at.isoformat() if s.expires_at else None,
    }
