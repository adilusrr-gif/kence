from datetime import datetime, timezone, timedelta
from typing import Optional
from app.core.database import SessionLocal
from app.models.models import UsageLog, DocSession, KPISnapshot, DocumentLibrary


def compute_kpi_snapshot(org_id: int, period: str = "day") -> dict:
    now = datetime.now(timezone.utc)
    if period == "day":
        since = now - timedelta(days=1)
    elif period == "week":
        since = now - timedelta(weeks=1)
    else:
        since = now - timedelta(days=30)

    with SessionLocal() as db:
        logs = db.query(UsageLog).filter(
            UsageLog.org_id == org_id,
            UsageLog.created_at >= since,
        ).all()

        total_sessions = db.query(DocSession).filter(
            DocSession.org_id == org_id,
            DocSession.created_at >= since,
        ).count()

        library_docs = db.query(DocumentLibrary).filter_by(org_id=org_id).count()

        by_type: dict[str, int] = {}
        unique_users: set = set()
        for log in logs:
            by_type[log.event_type] = by_type.get(log.event_type, 0) + 1
            if log.username:
                unique_users.add(log.username)

        metrics = {
            "total_events": len(logs),
            "total_sessions": total_sessions,
            "library_docs": library_docs,
            "unique_users": len(unique_users),
            "by_type": by_type,
            "uploads": by_type.get("upload", 0),
            "chats": by_type.get("chat", 0),
            "translations": by_type.get("translate", 0),
            "comparisons": by_type.get("compare", 0),
            "presentations": by_type.get("presentation", 0),
        }

        snapshot = KPISnapshot(
            org_id=org_id,
            snapshot_at=now,
            period=period,
            metrics=metrics,
        )
        db.add(snapshot)
        db.commit()

        return metrics


def get_kpi_trend(org_id: int, period: str = "day", n_periods: int = 7) -> list[dict]:
    with SessionLocal() as db:
        snapshots = (
            db.query(KPISnapshot)
            .filter(KPISnapshot.org_id == org_id, KPISnapshot.period == period)
            .order_by(KPISnapshot.snapshot_at.desc())
            .limit(n_periods)
            .all()
        )
        return [
            {
                "snapshot_at": s.snapshot_at.isoformat(),
                "period": s.period,
                **s.metrics,
            }
            for s in reversed(snapshots)
        ]


def export_kpi_report(org_id: int, period: str = "week", fmt: str = "pdf") -> bytes:
    metrics = compute_kpi_snapshot(org_id, period)
    trend = get_kpi_trend(org_id, period, n_periods=4)

    if fmt == "xlsx":
        return _build_xlsx(metrics, trend, org_id, period)
    else:
        return _build_pdf(metrics, trend, org_id, period)


def _build_pdf(metrics: dict, trend: list, org_id: int, period: str) -> bytes:
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib import colors
        import io

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4)
        styles = getSampleStyleSheet()
        story = []

        story.append(Paragraph(f"KPI Report — Org {org_id} ({period})", styles["Title"]))
        story.append(Spacer(1, 12))

        data = [["Метрика", "Значение"]] + [[k, str(v)] for k, v in metrics.items() if not isinstance(v, dict)]
        t = Table(data)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#22d3ee")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        story.append(t)
        doc.build(story)
        return buf.getvalue()
    except ImportError:
        return b"reportlab not installed"


def _build_xlsx(metrics: dict, trend: list, org_id: int, period: str) -> bytes:
    try:
        import openpyxl
        import io

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "KPI Overview"
        ws.append(["Метрика", "Значение"])
        for k, v in metrics.items():
            if not isinstance(v, dict):
                ws.append([k, v])

        if trend:
            ws2 = wb.create_sheet("Trend")
            headers = ["snapshot_at"] + [k for k in trend[0].keys() if k != "snapshot_at"]
            ws2.append(headers)
            for row in trend:
                ws2.append([row.get(h, "") for h in headers])

        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()
    except ImportError:
        return b"openpyxl not installed"
