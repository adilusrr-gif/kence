from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.api.auth_routes import get_current_user, require_org_member, require_org_admin
from app.services.branding_service import get_branding, get_branding_by_slug, update_branding

router = APIRouter(tags=["branding"])


class UpdateBrandingRequest(BaseModel):
    logo_url: Optional[str] = None
    favicon_url: Optional[str] = None
    accent_color: Optional[str] = None
    app_name: Optional[str] = None
    custom_css: Optional[str] = None


@router.get("/branding/{org_slug}")
async def public_branding(org_slug: str):
    """Public endpoint — used on login page before auth."""
    return get_branding_by_slug(org_slug)


@router.get("/orgs/{org_id}/branding")
async def org_branding(org_id: int, current_user: dict = Depends(get_current_user)):
    require_org_member(org_id, current_user)
    return get_branding(org_id)


@router.put("/orgs/{org_id}/branding")
async def update_org_branding(
    org_id: int,
    req: UpdateBrandingRequest,
    current_user: dict = Depends(get_current_user),
):
    require_org_admin(org_id, current_user)
    fields = {k: v for k, v in req.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(status_code=400, detail="Нечего обновлять")
    return update_branding(org_id, **fields)
