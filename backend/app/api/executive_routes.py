from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from app.api.auth_routes import get_current_user, require_org_admin
from app.services.kpi_service import compute_kpi_snapshot, get_kpi_trend, export_kpi_report

router = APIRouter(tags=["executive"])


@router.get("/orgs/{org_id}/executive/kpi")
async def kpi_snapshot(
    org_id: int,
    period: str = Query("day", pattern="^(day|week|month)$"),
    current_user: dict = Depends(get_current_user),
):
    require_org_admin(org_id, current_user)
    return compute_kpi_snapshot(org_id, period)


@router.get("/orgs/{org_id}/executive/trend")
async def kpi_trend(
    org_id: int,
    period: str = Query("day", pattern="^(day|week|month)$"),
    n: int = Query(7, ge=1, le=30),
    current_user: dict = Depends(get_current_user),
):
    require_org_admin(org_id, current_user)
    return get_kpi_trend(org_id, period, n)


@router.get("/orgs/{org_id}/executive/export")
async def export_report(
    org_id: int,
    period: str = Query("week", pattern="^(day|week|month)$"),
    format: str = Query("pdf", pattern="^(pdf|xlsx)$"),
    current_user: dict = Depends(get_current_user),
):
    require_org_admin(org_id, current_user)
    data = export_kpi_report(org_id, period, format)
    if format == "xlsx":
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = f"kpi_report_{org_id}_{period}.xlsx"
    else:
        media_type = "application/pdf"
        filename = f"kpi_report_{org_id}_{period}.pdf"
    return Response(
        content=data,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
