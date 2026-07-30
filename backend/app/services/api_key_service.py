import hashlib
import hmac
import secrets
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
from app.core.config import get_settings
from app.core.database import SessionLocal
from app.models.models import APIKey
from fastapi import HTTPException


_settings = get_settings()
_PREFIX = _settings.API_KEY_PREFIX


def _db() -> Session:
    return SessionLocal()


def _hash_key(raw_key: str) -> str:
    """HMAC-SHA256 when API_KEY_HMAC_SECRET is set; plain SHA-256 otherwise."""
    secret = _settings.API_KEY_HMAC_SECRET.encode()
    if secret:
        return hmac.new(secret, raw_key.encode(), hashlib.sha256).hexdigest()
    return hashlib.sha256(raw_key.encode()).hexdigest()


def create_api_key(org_id: int, created_by: str, name: Optional[str] = None, expires_at: Optional[datetime] = None) -> tuple[str, dict]:
    raw_key = _PREFIX + secrets.token_urlsafe(32)
    key_hash = _hash_key(raw_key)
    key_prefix = raw_key[:8]

    with _db() as db:
        record = APIKey(
            key_hash=key_hash,
            key_prefix=key_prefix,
            org_id=org_id,
            created_by=created_by,
            name=name,
            expires_at=expires_at,
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return raw_key, _key_to_dict(record)


def validate_api_key(raw_key: str) -> Optional[dict]:
    if not raw_key or not raw_key.startswith(_PREFIX):
        return None
    key_hash = _hash_key(raw_key)
    with _db() as db:
        record = db.query(APIKey).filter_by(key_hash=key_hash, is_active=True).first()
        if not record:
            return None
        # Constant-time comparison — prevents timing oracle on the stored hash
        if not hmac.compare_digest(record.key_hash, key_hash):
            return None
        if record.expires_at and record.expires_at < datetime.now(timezone.utc):
            return None
        record.last_used_at = datetime.now(timezone.utc)
        db.commit()
        return {
            "username": f"apikey:{record.key_prefix}",
            "role": "api",
            "org_id": record.org_id,
            "is_active": True,
            "key_id": record.id,
        }


def revoke_api_key(key_id: int, requester_username: str, requester_org_id: int) -> bool:
    with _db() as db:
        record = db.query(APIKey).filter_by(id=key_id, org_id=requester_org_id).first()
        if not record:
            return False
        record.is_active = False
        db.commit()
        return True


def list_api_keys(org_id: int) -> list[dict]:
    with _db() as db:
        keys = db.query(APIKey).filter_by(org_id=org_id).all()
        return [_key_to_dict(k) for k in keys]


def _key_to_dict(k: APIKey) -> dict:
    return {
        "id": k.id,
        "key_prefix": k.key_prefix,
        "name": k.name,
        "org_id": k.org_id,
        "created_by": k.created_by,
        "is_active": k.is_active,
        "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None,
        "expires_at": k.expires_at.isoformat() if k.expires_at else None,
        "created_at": k.created_at.isoformat() if k.created_at else None,
    }
