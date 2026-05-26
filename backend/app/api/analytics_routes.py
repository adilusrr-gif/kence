from fastapi import APIRouter, Depends
from app.api.auth_routes import get_current_user
from app.services import analytics_service

router = APIRouter()


@router.get("/analytics/overview")
async def analytics_overview(user: dict = Depends(get_current_user)):
    return analytics_service.get_overview()


@router.get("/analytics/timeline")
async def analytics_timeline(days: int = 7, user: dict = Depends(get_current_user)):
    days = max(1, min(days, 30))
    return {"days": days, "data": analytics_service.get_timeline(days)}


@router.get("/analytics/formats")
async def analytics_formats(user: dict = Depends(get_current_user)):
    return {"data": analytics_service.get_format_stats()}


@router.get("/analytics/events")
async def analytics_events(limit: int = 20, user: dict = Depends(get_current_user)):
    limit = max(1, min(limit, 100))
    return {"data": analytics_service.get_recent_events(limit)}
