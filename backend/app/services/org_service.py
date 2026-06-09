import os
from typing import Optional
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.models import Organization, OrgMembership, OrgQuota, UserQuota, UsageLog, DocSession
from fastapi import HTTPException


def _db() -> Session:
    return SessionLocal()


def create_org(slug: str, display_name: str, owner_username: str, plan: str = "free") -> dict:
    with _db() as db:
        if db.query(Organization).filter_by(slug=slug).first():
            raise HTTPException(status_code=409, detail=f"Org slug '{slug}' already exists")
        org = Organization(slug=slug, display_name=display_name, plan=plan)
        db.add(org)
        db.flush()
        membership = OrgMembership(org_id=org.id, username=owner_username, org_role="owner")
        quota = OrgQuota(org_id=org.id)
        db.add(membership)
        db.add(quota)
        db.commit()
        db.refresh(org)
        return _org_to_dict(org)


def get_org(org_id: int) -> Optional[dict]:
    with _db() as db:
        org = db.query(Organization).filter_by(id=org_id).first()
        return _org_to_dict(org) if org else None


def get_org_by_slug(slug: str) -> Optional[dict]:
    with _db() as db:
        org = db.query(Organization).filter_by(slug=slug).first()
        return _org_to_dict(org) if org else None


def list_orgs() -> list[dict]:
    with _db() as db:
        return [_org_to_dict(o) for o in db.query(Organization).all()]


def update_org(org_id: int, **fields) -> dict:
    allowed = {"display_name", "plan", "is_active"}
    with _db() as db:
        org = db.query(Organization).filter_by(id=org_id).first()
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")
        for k, v in fields.items():
            if k in allowed:
                setattr(org, k, v)
        db.commit()
        db.refresh(org)
        return _org_to_dict(org)


def delete_org(org_id: int) -> bool:
    with _db() as db:
        org = db.query(Organization).filter_by(id=org_id).first()
        if not org:
            return False
        org.is_active = False
        db.commit()
        return True


def add_member(org_id: int, username: str, org_role: str = "member") -> dict:
    with _db() as db:
        existing = db.query(OrgMembership).filter_by(org_id=org_id, username=username).first()
        if existing:
            raise HTTPException(status_code=409, detail="User is already a member")
        m = OrgMembership(org_id=org_id, username=username, org_role=org_role)
        db.add(m)
        db.commit()
        db.refresh(m)
        return _membership_to_dict(m)


def remove_member(org_id: int, username: str) -> bool:
    with _db() as db:
        m = db.query(OrgMembership).filter_by(org_id=org_id, username=username).first()
        if not m:
            return False
        db.delete(m)
        db.commit()
        return True


def change_member_role(org_id: int, username: str, new_role: str) -> bool:
    with _db() as db:
        m = db.query(OrgMembership).filter_by(org_id=org_id, username=username).first()
        if not m:
            return False
        m.org_role = new_role
        db.commit()
        return True


def list_members(org_id: int) -> list[dict]:
    with _db() as db:
        members = db.query(OrgMembership).filter_by(org_id=org_id).all()
        return [_membership_to_dict(m) for m in members]


def get_user_orgs(username: str) -> list[dict]:
    with _db() as db:
        rows = (
            db.query(Organization, OrgMembership)
            .join(OrgMembership, OrgMembership.org_id == Organization.id)
            .filter(OrgMembership.username == username, Organization.is_active == True)
            .all()
        )
        result = []
        for org, m in rows:
            d = _org_to_dict(org)
            d["org_role"] = m.org_role
            result.append(d)
        return result


def get_membership(org_id: int, username: str) -> Optional[dict]:
    with _db() as db:
        m = db.query(OrgMembership).filter_by(org_id=org_id, username=username).first()
        return _membership_to_dict(m) if m else None


def get_effective_quota(org_id: int) -> dict:
    with _db() as db:
        q = db.query(OrgQuota).filter_by(org_id=org_id).first()
        if not q:
            return {"max_storage_mb": 5120, "max_sessions": 100, "max_api_calls_per_day": 1000}
        return {
            "max_storage_mb": q.max_storage_mb,
            "max_sessions": q.max_sessions,
            "max_api_calls_per_day": q.max_api_calls_per_day,
        }


def update_quota(org_id: int, **fields) -> dict:
    allowed = {"max_storage_mb", "max_sessions", "max_api_calls_per_day"}
    with _db() as db:
        q = db.query(OrgQuota).filter_by(org_id=org_id).first()
        if not q:
            q = OrgQuota(org_id=org_id)
            db.add(q)
        for k, v in fields.items():
            if k in allowed:
                setattr(q, k, v)
        db.commit()
        return get_effective_quota(org_id)


def check_session_quota(org_id: int, username: str) -> None:
    """Raises HTTP 429 if the org's session quota is exceeded."""
    from app.services.quota_service import count_org_sessions_total
    quota = get_effective_quota(org_id)
    count = count_org_sessions_total(org_id)
    if count >= quota["max_sessions"]:
        raise HTTPException(status_code=429, detail="Organization session quota exceeded")


def ensure_default_org() -> dict:
    """Called at startup — creates the default org if it doesn't exist."""
    from app.services.user_service import list_users
    with _db() as db:
        org = db.query(Organization).filter_by(slug="default").first()
        if not org:
            org = Organization(slug="default", display_name="Default Organization", plan="enterprise")
            db.add(org)
            db.flush()
            quota = OrgQuota(org_id=org.id)
            db.add(quota)
            db.flush()

            # Enroll all existing users
            users = list_users()
            for u in users:
                role = "owner" if u["role"] == "admin" else "member"
                existing = db.query(OrgMembership).filter_by(org_id=org.id, username=u["username"]).first()
                if not existing:
                    db.add(OrgMembership(org_id=org.id, username=u["username"], org_role=role))

            db.commit()
            db.refresh(org)

        return _org_to_dict(org)


def _org_to_dict(org: Organization) -> dict:
    return {
        "id": org.id,
        "slug": org.slug,
        "display_name": org.display_name,
        "plan": org.plan,
        "is_active": org.is_active,
        "created_at": org.created_at.isoformat() if org.created_at else None,
    }


def _membership_to_dict(m: OrgMembership) -> dict:
    return {
        "id": m.id,
        "org_id": m.org_id,
        "username": m.username,
        "org_role": m.org_role,
        "joined_at": m.joined_at.isoformat() if m.joined_at else None,
    }
