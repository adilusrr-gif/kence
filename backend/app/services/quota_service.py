import os
from datetime import datetime, timezone, timedelta
from app.core.database import SessionLocal
from app.models.models import DocSession, UsageLog


def count_org_sessions_total(org_id: int) -> int:
    with SessionLocal() as db:
        return db.query(DocSession).filter_by(org_id=org_id).count()


def count_user_sessions_today(username: str, org_id: int) -> int:
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    with SessionLocal() as db:
        return (
            db.query(DocSession)
            .filter(
                DocSession.owner_username == username,
                DocSession.org_id == org_id,
                DocSession.created_at >= today_start,
            )
            .count()
        )


def count_org_api_calls_today(org_id: int) -> int:
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    with SessionLocal() as db:
        return (
            db.query(UsageLog)
            .filter(
                UsageLog.org_id == org_id,
                UsageLog.created_at >= today_start,
            )
            .count()
        )


def get_storage_used_mb(org_id: int) -> float:
    """Calculates disk usage for all sessions belonging to an org."""
    upload_dir = os.getenv("UPLOAD_DIR", "./uploads")
    with SessionLocal() as db:
        sessions = db.query(DocSession.session_id).filter_by(org_id=org_id).all()

    total_bytes = 0
    for (session_id,) in sessions:
        session_path = os.path.join(upload_dir, session_id)
        if os.path.isdir(session_path):
            for root, _, files in os.walk(session_path):
                for f in files:
                    try:
                        total_bytes += os.path.getsize(os.path.join(root, f))
                    except OSError:
                        pass
    return round(total_bytes / (1024 * 1024), 2)
