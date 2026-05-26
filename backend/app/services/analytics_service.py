import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy import func, text

logger = logging.getLogger(__name__)


def log_event(
    event_type: str,
    username: Optional[str] = None,
    session_id: Optional[str] = None,
    file_format: Optional[str] = None,
    **extra,
) -> None:
    try:
        from app.core.database import SessionLocal
        from app.models.models import UsageLog
        with SessionLocal() as db:
            db.add(UsageLog(
                event_type=event_type,
                username=username,
                session_id=session_id,
                file_format=file_format,
                extra=extra or None,
            ))
            db.commit()
    except Exception as e:
        logger.warning("analytics log_event failed: %s", e)


def get_overview() -> dict:
    try:
        from app.core.database import SessionLocal
        from app.models.models import UsageLog
        with SessionLocal() as db:
            rows = (
                db.query(UsageLog.event_type, func.count(UsageLog.id))
                .group_by(UsageLog.event_type)
                .all()
            )
            totals = {et: cnt for et, cnt in rows}
            total_users = db.query(func.count(func.distinct(UsageLog.username))).scalar() or 0
            total_events = db.query(func.count(UsageLog.id)).scalar() or 0
            since_week = datetime.now(timezone.utc) - timedelta(days=7)
            week_events = (
                db.query(func.count(UsageLog.id))
                .filter(UsageLog.created_at >= since_week)
                .scalar() or 0
            )
        return {
            "total_events": total_events,
            "week_events": week_events,
            "unique_users": total_users,
            "by_type": totals,
        }
    except Exception as e:
        logger.warning("analytics get_overview failed: %s", e)
        return {"total_events": 0, "week_events": 0, "unique_users": 0, "by_type": {}}


def get_timeline(days: int = 7) -> list:
    try:
        from app.core.database import SessionLocal
        from app.models.models import UsageLog
        since = datetime.now(timezone.utc) - timedelta(days=days)
        with SessionLocal() as db:
            rows = db.execute(
                text(
                    "SELECT DATE(created_at AT TIME ZONE 'UTC') as day, COUNT(*) as cnt "
                    "FROM usage_logs WHERE created_at >= :since "
                    "GROUP BY day ORDER BY day"
                ),
                {"since": since},
            ).fetchall()
        # Fill gaps
        result = []
        for i in range(days):
            d = (datetime.now(timezone.utc) - timedelta(days=days - 1 - i)).date()
            cnt = next((r.cnt for r in rows if str(r.day) == str(d)), 0)
            result.append({"date": str(d), "count": int(cnt)})
        return result
    except Exception as e:
        logger.warning("analytics get_timeline failed: %s", e)
        return []


def get_format_stats() -> list:
    try:
        from app.core.database import SessionLocal
        from app.models.models import UsageLog
        with SessionLocal() as db:
            rows = (
                db.query(UsageLog.file_format, func.count(UsageLog.id))
                .filter(UsageLog.file_format.isnot(None))
                .filter(UsageLog.event_type == "upload")
                .group_by(UsageLog.file_format)
                .order_by(func.count(UsageLog.id).desc())
                .limit(8)
                .all()
            )
        return [{"format": fmt or "other", "count": int(cnt)} for fmt, cnt in rows]
    except Exception as e:
        logger.warning("analytics get_format_stats failed: %s", e)
        return []


def get_recent_events(limit: int = 20) -> list:
    try:
        from app.core.database import SessionLocal
        from app.models.models import UsageLog
        with SessionLocal() as db:
            rows = (
                db.query(UsageLog)
                .order_by(UsageLog.created_at.desc())
                .limit(limit)
                .all()
            )
        return [
            {
                "id": r.id,
                "event_type": r.event_type,
                "username": r.username,
                "session_id": r.session_id,
                "file_format": r.file_format,
                "extra": r.extra,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
    except Exception as e:
        logger.warning("analytics get_recent_events failed: %s", e)
        return []
