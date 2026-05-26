from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from app.api.auth_routes import get_current_user
from app.services.share_service import (
    share_session, get_session_shares, revoke_share, get_sessions_shared_with
)

router = APIRouter(tags=["sharing"])


class ShareSessionRequest(BaseModel):
    shared_with: Optional[str] = None  # null = share to whole org
    org_id: int
    permission: str = "view"
    expires_at: Optional[datetime] = None


@router.get("/sessions/{session_id}/shares")
async def list_session_shares(session_id: str, current_user: dict = Depends(get_current_user)):
    return get_session_shares(session_id)


@router.post("/sessions/{session_id}/shares")
async def share_session_endpoint(
    session_id: str,
    req: ShareSessionRequest,
    current_user: dict = Depends(get_current_user),
):
    allowed_permissions = {"view", "edit", "comment"}
    if req.permission not in allowed_permissions:
        raise HTTPException(status_code=400, detail=f"Допустимые права: {', '.join(allowed_permissions)}")
    return share_session(
        session_id=session_id,
        shared_by=current_user["username"],
        org_id=req.org_id,
        permission=req.permission,
        shared_with=req.shared_with,
        expires_at=req.expires_at,
    )


@router.delete("/sessions/{session_id}/shares/{share_id}")
async def revoke_session_share(
    session_id: str,
    share_id: int,
    current_user: dict = Depends(get_current_user),
):
    ok = revoke_share(share_id, current_user["username"])
    if not ok:
        raise HTTPException(status_code=404, detail="Запись о доступе не найдена")
    return {"message": "Доступ отозван"}


@router.get("/sessions/shared-with-me")
async def sessions_shared_with_me(
    org_id: int = Query(...),
    current_user: dict = Depends(get_current_user),
):
    return get_sessions_shared_with(current_user["username"], org_id)
