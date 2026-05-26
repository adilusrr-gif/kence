from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from app.api.auth_routes import get_current_user, require_admin, require_org_member, require_org_admin, require_org_owner
from app.services.org_service import (
    create_org, get_org, list_orgs, update_org, delete_org,
    add_member, remove_member, change_member_role, list_members,
    get_user_orgs, get_effective_quota, update_quota,
)
from app.services.api_key_service import create_api_key, revoke_api_key, list_api_keys

router = APIRouter(prefix="/orgs", tags=["organizations"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class CreateOrgRequest(BaseModel):
    slug: str
    display_name: str
    plan: str = "free"


class UpdateOrgRequest(BaseModel):
    display_name: Optional[str] = None
    plan: Optional[str] = None
    is_active: Optional[bool] = None


class AddMemberRequest(BaseModel):
    username: str
    org_role: str = "member"


class ChangeRoleRequest(BaseModel):
    org_role: str


class UpdateQuotaRequest(BaseModel):
    max_storage_mb: Optional[int] = None
    max_sessions: Optional[int] = None
    max_api_calls_per_day: Optional[int] = None


class CreateAPIKeyRequest(BaseModel):
    name: Optional[str] = None
    expires_at: Optional[datetime] = None


# ── Org CRUD ─────────────────────────────────────────────────────────────────

@router.get("/me")
async def my_orgs(current_user: dict = Depends(get_current_user)):
    return get_user_orgs(current_user["username"])


@router.post("")
async def create_organization(req: CreateOrgRequest, admin: dict = Depends(require_admin)):
    return create_org(req.slug, req.display_name, admin["username"], req.plan)


@router.get("")
async def list_organizations(admin: dict = Depends(require_admin)):
    return list_orgs()


@router.get("/{org_id}")
async def get_organization(org_id: int, current_user: dict = Depends(get_current_user)):
    require_org_member(org_id, current_user)
    org = get_org(org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Организация не найдена")
    return org


@router.patch("/{org_id}")
async def update_organization(org_id: int, req: UpdateOrgRequest, current_user: dict = Depends(get_current_user)):
    require_org_admin(org_id, current_user)
    fields = {k: v for k, v in req.model_dump().items() if v is not None}
    return update_org(org_id, **fields)


@router.delete("/{org_id}")
async def delete_organization(org_id: int, admin: dict = Depends(require_admin)):
    ok = delete_org(org_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Организация не найдена")
    return {"message": "Организация деактивирована"}


# ── Members ───────────────────────────────────────────────────────────────────

@router.get("/{org_id}/members")
async def get_members(org_id: int, current_user: dict = Depends(get_current_user)):
    require_org_member(org_id, current_user)
    return list_members(org_id)


@router.post("/{org_id}/members")
async def add_org_member(org_id: int, req: AddMemberRequest, current_user: dict = Depends(get_current_user)):
    require_org_admin(org_id, current_user)
    return add_member(org_id, req.username, req.org_role)


@router.delete("/{org_id}/members/{username}")
async def remove_org_member(org_id: int, username: str, current_user: dict = Depends(get_current_user)):
    require_org_admin(org_id, current_user)
    ok = remove_member(org_id, username)
    if not ok:
        raise HTTPException(status_code=404, detail="Участник не найден")
    return {"message": f"Участник {username} удалён"}


@router.patch("/{org_id}/members/{username}/role")
async def change_org_member_role(org_id: int, username: str, req: ChangeRoleRequest, current_user: dict = Depends(get_current_user)):
    require_org_admin(org_id, current_user)
    allowed = {"owner", "admin", "member", "viewer"}
    if req.org_role not in allowed:
        raise HTTPException(status_code=400, detail=f"Допустимые роли: {', '.join(allowed)}")
    ok = change_member_role(org_id, username, req.org_role)
    if not ok:
        raise HTTPException(status_code=404, detail="Участник не найден")
    return {"message": f"Роль {username} изменена на {req.org_role}"}


# ── Quotas ────────────────────────────────────────────────────────────────────

@router.get("/{org_id}/quota")
async def get_quota(org_id: int, current_user: dict = Depends(get_current_user)):
    require_org_admin(org_id, current_user)
    from app.services.quota_service import get_storage_used_mb, count_org_api_calls_today, count_org_sessions_total
    quota = get_effective_quota(org_id)
    quota["used_storage_mb"] = get_storage_used_mb(org_id)
    quota["used_sessions"] = count_org_sessions_total(org_id)
    quota["used_api_calls_today"] = count_org_api_calls_today(org_id)
    return quota


@router.patch("/{org_id}/quota")
async def set_quota(org_id: int, req: UpdateQuotaRequest, admin: dict = Depends(require_admin)):
    fields = {k: v for k, v in req.model_dump().items() if v is not None}
    return update_quota(org_id, **fields)


# ── API Keys ──────────────────────────────────────────────────────────────────

@router.get("/{org_id}/api-keys")
async def get_api_keys(org_id: int, current_user: dict = Depends(get_current_user)):
    require_org_admin(org_id, current_user)
    return list_api_keys(org_id)


@router.post("/{org_id}/api-keys")
async def create_org_api_key(org_id: int, req: CreateAPIKeyRequest, current_user: dict = Depends(get_current_user)):
    require_org_admin(org_id, current_user)
    raw_key, record = create_api_key(org_id, current_user["username"], req.name, req.expires_at)
    return {"raw_key": raw_key, **record}


@router.delete("/{org_id}/api-keys/{key_id}")
async def revoke_org_api_key(org_id: int, key_id: int, current_user: dict = Depends(get_current_user)):
    require_org_admin(org_id, current_user)
    ok = revoke_api_key(key_id, current_user["username"], org_id)
    if not ok:
        raise HTTPException(status_code=404, detail="API-ключ не найден")
    return {"message": "API-ключ отозван"}
