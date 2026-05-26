from typing import Optional
from app.core.database import SessionLocal
from app.models.models import OrgBranding, Organization
from fastapi import HTTPException

_DEFAULTS = {
    "logo_url": None,
    "favicon_url": None,
    "accent_color": "#22d3ee",
    "app_name": "KENCE.ai",
    "custom_css": None,
}


def get_branding(org_id: int) -> dict:
    with SessionLocal() as db:
        b = db.query(OrgBranding).filter_by(org_id=org_id).first()
        return _branding_to_dict(b, org_id) if b else {**_DEFAULTS, "org_id": org_id}


def get_branding_by_slug(slug: str) -> dict:
    with SessionLocal() as db:
        org = db.query(Organization).filter_by(slug=slug, is_active=True).first()
        if not org:
            return {**_DEFAULTS, "org_id": None, "slug": slug}
        b = db.query(OrgBranding).filter_by(org_id=org.id).first()
        result = _branding_to_dict(b, org.id) if b else {**_DEFAULTS, "org_id": org.id}
        result["slug"] = slug
        result["display_name"] = org.display_name
        return result


def update_branding(org_id: int, **fields) -> dict:
    allowed = {"logo_url", "favicon_url", "accent_color", "app_name", "custom_css"}
    with SessionLocal() as db:
        b = db.query(OrgBranding).filter_by(org_id=org_id).first()
        if not b:
            b = OrgBranding(org_id=org_id)
            db.add(b)
        for k, v in fields.items():
            if k in allowed:
                setattr(b, k, v)
        db.commit()
        db.refresh(b)
        return _branding_to_dict(b, org_id)


def _branding_to_dict(b: Optional[OrgBranding], org_id: int) -> dict:
    if not b:
        return {**_DEFAULTS, "org_id": org_id}
    return {
        "org_id": org_id,
        "logo_url": b.logo_url or _DEFAULTS["logo_url"],
        "favicon_url": b.favicon_url or _DEFAULTS["favicon_url"],
        "accent_color": b.accent_color or _DEFAULTS["accent_color"],
        "app_name": b.app_name or _DEFAULTS["app_name"],
        "custom_css": b.custom_css or _DEFAULTS["custom_css"],
        "updated_at": b.updated_at.isoformat() if b.updated_at else None,
    }
