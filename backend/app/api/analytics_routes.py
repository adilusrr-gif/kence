import asyncio
from fastapi import APIRouter, Depends
from app.api.auth_routes import require_admin
from app.services import analytics_service

router = APIRouter()


@router.get("/analytics/overview")
async def analytics_overview(admin: dict = Depends(require_admin)):
    return await asyncio.to_thread(analytics_service.get_overview)


@router.get("/analytics/timeline")
async def analytics_timeline(days: int = 7, admin: dict = Depends(require_admin)):
    days = max(1, min(days, 30))
    data = await asyncio.to_thread(analytics_service.get_timeline, days)
    return {"days": days, "data": data}


@router.get("/analytics/formats")
async def analytics_formats(admin: dict = Depends(require_admin)):
    return {"data": await asyncio.to_thread(analytics_service.get_format_stats)}


@router.get("/analytics/events")
async def analytics_events(limit: int = 20, admin: dict = Depends(require_admin)):
    limit = max(1, min(limit, 100))
    return {"data": await asyncio.to_thread(analytics_service.get_recent_events, limit)}
