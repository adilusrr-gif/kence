from __future__ import annotations

import asyncio
import io
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.api.auth_routes import get_current_user
from app.services import analytics_service
from app.services import audit_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/insights", tags=["insights"])


def _content_disposition(filename: str) -> str:
    """Builds a Content-Disposition header safe for non-ASCII (e.g. Cyrillic)
    filenames — HTTP headers are latin-1 only, so a raw Unicode filename in
    `filename=` crashes response encoding. ASCII fallback + RFC 5987 filename*."""
    ascii_fallback = filename.encode("ascii", "ignore").decode("ascii") or "export.pdf"
    return f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{quote(filename)}"


class ExportRequest(BaseModel):
    document_name: str = "Документ"
    results: dict[str, Any] = {}
    org_name: Optional[str] = None


def _build_pdf(req: ExportRequest, username: str) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, HRFlowable,
        Table, TableStyle, KeepTogether,
    )
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    import os

    # Register DejaVu fonts for Cyrillic support (fonts-dejavu-core in Dockerfile)
    _FONT = "Helvetica"
    _FONT_B = "Helvetica-Bold"
    _FONT_I = "Helvetica-Oblique"

    _DEJAVU_DIRS = [
        "/usr/share/fonts/truetype/dejavu",
        "/usr/share/fonts/dejavu-sans-fonts",
        "/usr/share/fonts/TTF",
        "/usr/share/fonts/dejavu",
    ]
    for _d in _DEJAVU_DIRS:
        _r = os.path.join(_d, "DejaVuSans.ttf")
        if not os.path.exists(_r):
            continue
        try:
            pdfmetrics.registerFont(TTFont("DejaVuSans", _r))
            _b = os.path.join(_d, "DejaVuSans-Bold.ttf")
            pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", _b if os.path.exists(_b) else _r))
            _i = os.path.join(_d, "DejaVuSans-Oblique.ttf")
            pdfmetrics.registerFont(TTFont("DejaVuSans-Oblique", _i if os.path.exists(_i) else _r))
            _FONT = "DejaVuSans"
            _FONT_B = "DejaVuSans-Bold"
            _FONT_I = "DejaVuSans-Oblique"
        except Exception:
            pass
        break

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=16 * mm, bottomMargin=20 * mm,
        title="KENCE.ai Intelligence Brief",
        author=username,
    )

    w = A4[0] - 40 * mm  # usable width

    navy   = colors.HexColor("#0f172a")
    slate  = colors.HexColor("#334155")
    muted  = colors.HexColor("#64748b")
    accent = colors.HexColor("#22d3ee")
    danger = colors.HexColor("#ef4444")
    amber  = colors.HexColor("#f59e0b")
    green  = colors.HexColor("#22c55e")
    light  = colors.HexColor("#f1f5f9")

    styles = getSampleStyleSheet()

    def sty(name, **kw):
        return ParagraphStyle(name, parent=styles["Normal"], **kw)

    s_header_title = sty("HT", fontName=_FONT_B, fontSize=20, textColor=colors.white, alignment=TA_CENTER, leading=24)
    s_header_sub   = sty("HS", fontName=_FONT_I, fontSize=9, textColor=colors.HexColor("#94a3b8"), alignment=TA_CENTER, leading=12)
    s_doc_title    = sty("DT", fontName=_FONT_B, fontSize=14, textColor=navy, leading=18)
    s_meta         = sty("MT", fontName=_FONT_I, fontSize=8, textColor=muted, leading=12)
    s_section      = sty("SC", fontName=_FONT_B, fontSize=9, textColor=navy, leading=12, spaceBefore=6)
    s_body         = sty("BD", fontName=_FONT,   fontSize=10, textColor=slate, leading=15, spaceBefore=2)
    s_bullet       = sty("BU", fontName=_FONT,   fontSize=10, textColor=slate, leading=14, leftIndent=12, spaceBefore=2)
    s_footer       = sty("FT", fontName=_FONT_I, fontSize=7,  textColor=muted, alignment=TA_CENTER, leading=10)

    story = []

    # ── Header block ─────────────────────────────────────────────────────────
    header_data = [
        [Paragraph("KENCE.ai", s_header_title)],
        [Paragraph("Intelligence Brief", s_header_sub)],
    ]
    header_table = Table(header_data, colWidths=[w])
    header_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), navy),
        ("ROWPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 12),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 8 * mm))

    # ── Document title + meta ────────────────────────────────────────────────
    doc_title = (req.document_name or "Документ")[:100]
    story.append(Paragraph(doc_title, s_doc_title))
    story.append(Spacer(1, 2 * mm))

    ts = datetime.now(timezone.utc).strftime("%d.%m.%Y %H:%M UTC")
    meta_parts = [f"Составлено: {ts}", f"Автор: {username}"]
    if req.org_name:
        meta_parts.append(req.org_name)
    story.append(Paragraph("  ·  ".join(meta_parts), s_meta))
    story.append(HRFlowable(width=w, thickness=0.5, color=colors.HexColor("#e2e8f0"), spaceAfter=6))

    results = req.results
    summary_data   = results.get("summary", {})
    risk_data      = results.get("risk_engine", {})
    timeline_data  = results.get("timeline", {})
    extractor_data = results.get("data_extractor", {})

    def section(title):
        story.append(Spacer(1, 3 * mm))
        t = Table([[Paragraph(title.upper(), s_section)]], colWidths=[w])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), light),
            ("ROWPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(t)
        story.append(Spacer(1, 2 * mm))

    def para(text):
        safe = str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        story.append(Paragraph(safe, s_body))

    def bullet(text):
        safe = str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        story.append(Paragraph(f"• {safe}", s_bullet))

    # ── Summary ──────────────────────────────────────────────────────────────
    short = (
        summary_data.get("short_summary")
        or summary_data.get("executive_summary")
        or summary_data.get("summary")
        or ""
    )
    if short:
        section("Краткое содержание")
        para(short)

    key_points = summary_data.get("key_points") or summary_data.get("key_findings") or summary_data.get("main_points") or []
    if key_points:
        section("Ключевые выводы")
        for pt in key_points[:8]:
            bullet(str(pt))

    # ── Risk ─────────────────────────────────────────────────────────────────
    risk_score = (
        risk_data.get("overall_risk_score")
        or risk_data.get("risk_score")
        or risk_data.get("score")
    )
    risk_level  = risk_data.get("risk_level") or risk_data.get("level") or ""
    risk_summary = risk_data.get("summary") or risk_data.get("risk_summary") or ""
    risks = risk_data.get("risks") or risk_data.get("key_risks") or risk_data.get("top_risks") or []

    if risk_score is not None or risks:
        section("Оценка рисков")
        if risk_score is not None:
            score_str = f"Индекс риска: {risk_score}/100"
            if risk_level:
                score_str += f" [{risk_level.upper()}]"
            para(score_str)
        if risk_summary:
            para(risk_summary)
        for r in risks[:6]:
            if isinstance(r, dict):
                title_val = r.get("title") or r.get("name") or r.get("risk") or ""
                desc = r.get("description") or r.get("mitigation") or ""
                bullet(f"{title_val}: {desc}" if desc else title_val)
            else:
                bullet(str(r))

    actions = (
        risk_data.get("recommended_actions")
        or risk_data.get("action_items")
        or risk_data.get("recommendations")
        or summary_data.get("action_items")
        or []
    )
    if actions:
        section("Рекомендуемые действия")
        for idx, a in enumerate(actions[:6], 1):
            if isinstance(a, str):
                text = a
            elif isinstance(a, dict):
                text = a.get("action") or a.get("title") or str(a)
            else:
                text = str(a)
            bullet(f"{idx}. {text}")

    # ── Timeline ─────────────────────────────────────────────────────────────
    events = timeline_data.get("events") or timeline_data.get("timeline") or []
    if events:
        section("Хронология событий")
        for ev in events[:8]:
            if isinstance(ev, dict):
                date = ev.get("date") or ev.get("timestamp") or ""
                desc = ev.get("event") or ev.get("description") or ev.get("title") or str(ev)
                bullet(f"{date}  {desc}" if date else desc)
            else:
                bullet(str(ev))

    # ── Entities ─────────────────────────────────────────────────────────────
    people   = extractor_data.get("people") or extractor_data.get("persons") or []
    orgs_ex  = extractor_data.get("organizations") or extractor_data.get("entities") or []
    if people or orgs_ex:
        section("Участники и организации")
        if people:
            names = [p.get("name") if isinstance(p, dict) else str(p) for p in people[:10]]
            para(f"Люди: {', '.join(names)}")
        if orgs_ex:
            org_names = [o.get("name") if isinstance(o, dict) else str(o) for o in orgs_ex[:10]]
            para(f"Организации: {', '.join(org_names)}")

    # ── Footer ───────────────────────────────────────────────────────────────
    story.append(Spacer(1, 6 * mm))
    story.append(HRFlowable(width=w, thickness=0.5, color=colors.HexColor("#e2e8f0"), spaceBefore=4))
    story.append(Paragraph(
        "Документ сгенерирован системой KENCE.ai  ·  Локальная обработка  ·  Данные не передаются в облако",
        s_footer,
    ))

    doc.build(story)
    return buf.getvalue()


@router.post("/export")
async def export_brief_pdf(
    req: ExportRequest,
    current_user: dict = Depends(get_current_user),
):
    """Generate a formatted PDF intelligence brief from insight results."""
    username = current_user.get("username", "")
    try:
        pdf_bytes = _build_pdf(req, username)
    except Exception as e:
        logger.error("PDF generation failed: %s", e)
        from fastapi.responses import JSONResponse
        return JSONResponse({"error": "PDF generation failed", "detail": str(e)}, status_code=500)

    asyncio.create_task(asyncio.to_thread(
        analytics_service.log_event, "pdf_export",
        username=username,
        org_id=analytics_service.resolve_org_id(username),
        document_name=req.document_name,
    ))
    asyncio.create_task(asyncio.to_thread(
        audit_service.log, "export",
        username=username,
        document_name=req.document_name,
        detail={"format": "pdf", "type": "standard"},
    ))

    safe_name = (req.document_name or "doc").replace(" ", "_").replace("/", "_")[:40]
    filename = f"KENCE_Brief_{safe_name}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": _content_disposition(filename)},
    )


# ── Government Brief export ──────────────────────────────────────────────────

class ExportGovBriefRequest(BaseModel):
    document_name: str = "Документ"
    brief: dict[str, Any] = {}
    org_name: Optional[str] = None
    classification: str = "ДСП"


def _build_gov_pdf(req: ExportGovBriefRequest, username: str) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, HRFlowable,
        Table, TableStyle, KeepTogether,
    )
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    import os

    _FONT, _FONT_B, _FONT_I = "Helvetica", "Helvetica-Bold", "Helvetica-Oblique"
    for _d in ["/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/dejavu-sans-fonts",
               "/usr/share/fonts/TTF", "/usr/share/fonts/dejavu"]:
        _r = os.path.join(_d, "DejaVuSans.ttf")
        if not os.path.exists(_r):
            continue
        try:
            pdfmetrics.registerFont(TTFont("DejaVuSans", _r))
            _b = os.path.join(_d, "DejaVuSans-Bold.ttf")
            pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", _b if os.path.exists(_b) else _r))
            _i = os.path.join(_d, "DejaVuSans-Oblique.ttf")
            pdfmetrics.registerFont(TTFont("DejaVuSans-Oblique", _i if os.path.exists(_i) else _r))
            _FONT, _FONT_B, _FONT_I = "DejaVuSans", "DejaVuSans-Bold", "DejaVuSans-Oblique"
        except Exception:
            pass
        break

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=16 * mm, bottomMargin=20 * mm,
        title="KENCE.gov — Оперативная сводка",
        author=username,
    )
    w = A4[0] - 40 * mm

    navy   = colors.HexColor("#0f172a")
    slate  = colors.HexColor("#334155")
    muted  = colors.HexColor("#64748b")
    light  = colors.HexColor("#f1f5f9")
    danger = colors.HexColor("#ef4444")
    amber  = colors.HexColor("#f59e0b")
    green  = colors.HexColor("#22c55e")
    cyan   = colors.HexColor("#22d3ee")

    # Classification color map
    clf_colors = {
        "ОТКРЫТО":        colors.HexColor("#22c55e"),
        "ВНУТРЕННЕЕ":     colors.HexColor("#3b82f6"),
        "ДСП":            colors.HexColor("#f59e0b"),
        "КОНФИДЕНЦИАЛЬНО":colors.HexColor("#ef4444"),
        "СЕКРЕТНО":       colors.HexColor("#7c3aed"),
    }
    clf_color = clf_colors.get(req.classification.upper(), amber)

    styles = getSampleStyleSheet()
    def sty(name, **kw):
        return ParagraphStyle(name, parent=styles["Normal"], **kw)

    s_clf    = sty("CLF", fontName=_FONT_B, fontSize=10, textColor=colors.white, alignment=TA_CENTER, leading=14)
    s_htitle = sty("HT",  fontName=_FONT_B, fontSize=18, textColor=colors.white, alignment=TA_CENTER, leading=22)
    s_hsub   = sty("HS",  fontName=_FONT_I, fontSize=9,  textColor=colors.HexColor("#94a3b8"), alignment=TA_CENTER, leading=12)
    s_title  = sty("TI",  fontName=_FONT_B, fontSize=14, textColor=navy, leading=18)
    s_meta   = sty("MT",  fontName=_FONT_I, fontSize=8,  textColor=muted, leading=12)
    s_sec    = sty("SC",  fontName=_FONT_B, fontSize=9,  textColor=navy, leading=12, spaceBefore=4)
    s_body   = sty("BD",  fontName=_FONT,   fontSize=10, textColor=slate, leading=15, spaceBefore=2)
    s_bullet = sty("BU",  fontName=_FONT,   fontSize=10, textColor=slate, leading=14, leftIndent=12, spaceBefore=2)
    s_footer = sty("FT",  fontName=_FONT_I, fontSize=7,  textColor=muted, alignment=TA_CENTER, leading=10)

    story = []

    def safe(text):
        return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    def section(title, color=light):
        story.append(Spacer(1, 3 * mm))
        t = Table([[Paragraph(title.upper(), s_sec)]], colWidths=[w])
        t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), color),
                                ("ROWPADDING", (0, 0), (-1, -1), 4)]))
        story.append(t)
        story.append(Spacer(1, 2 * mm))

    def para(text):
        story.append(Paragraph(safe(text), s_body))

    def bullet(text):
        story.append(Paragraph(f"• {safe(text)}", s_bullet))

    # ── Classification banner (top) ──────────────────────────────────────────
    clf_table = Table([[Paragraph(req.classification.upper(), s_clf)]], colWidths=[w])
    clf_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), clf_color),
        ("ROWPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(clf_table)
    story.append(Spacer(1, 4 * mm))

    # ── Header ───────────────────────────────────────────────────────────────
    header = Table([
        [Paragraph("KENCE.gov", s_htitle)],
        [Paragraph("Оперативная сводка", s_hsub)],
    ], colWidths=[w])
    header.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), navy),
        ("ROWPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 12),
    ]))
    story.append(header)
    story.append(Spacer(1, 6 * mm))

    # ── Document title + meta ────────────────────────────────────────────────
    story.append(Paragraph(safe((req.document_name or "Документ")[:100]), s_title))
    story.append(Spacer(1, 2 * mm))
    ts = datetime.now(timezone.utc).strftime("%d.%m.%Y %H:%M UTC")
    meta = [f"Подготовлено: {ts}", f"Аналитик: {username}"]
    if req.org_name:
        meta.append(req.org_name)
    meta.append(f"Гриф: {req.classification}")
    story.append(Paragraph("  ·  ".join(meta), s_meta))
    story.append(HRFlowable(width=w, thickness=0.5, color=colors.HexColor("#e2e8f0"), spaceAfter=6))

    b = req.brief

    # ── Executive Summary ────────────────────────────────────────────────────
    summary = b.get("executive_summary") or b.get("short_summary") or ""
    if summary:
        section("Исполнительное резюме")
        para(summary)

    key_findings = b.get("key_findings") or []
    if key_findings:
        for f in key_findings[:6]:
            bullet(str(f))

    # ── Required Decisions ───────────────────────────────────────────────────
    decisions = b.get("required_decisions") or []
    if decisions:
        section("Требуемые решения", color=colors.HexColor("#fef2f2"))
        for i, d in enumerate(decisions, 1):
            if not isinstance(d, dict):
                bullet(f"{i}. {d}")
                continue
            dec_text = f"{i}. {d.get('decision', '')}"
            if d.get("responsible"):
                dec_text += f"  [Ответственный: {d['responsible']}]"
            if d.get("deadline"):
                dec_text += f"  [Срок: {d['deadline']}]"
            para(dec_text)
            if d.get("consequence"):
                bullet(f"⚠ {d['consequence']}")

    # ── Recommended Actions ──────────────────────────────────────────────────
    actions = b.get("recommended_actions") or []
    if actions:
        section("Рекомендуемые действия")
        for i, a in enumerate(actions[:8], 1):
            if isinstance(a, dict):
                action_text = a.get("action") or str(a)
                priority = a.get("priority", "")
            else:
                action_text = str(a)
                priority = ""
            bullet(f"{i}. [{priority}] {action_text}" if priority else f"{i}. {action_text}")

    # ── Deadlines ────────────────────────────────────────────────────────────
    deadlines = b.get("deadlines") or []
    if deadlines:
        section("Ключевые сроки")
        for dl in deadlines[:8]:
            if isinstance(dl, dict):
                date = dl.get("date") or dl.get("timestamp") or ""
                event = dl.get("event") or dl.get("description") or str(dl)
                bullet(f"{date}  {event}" if date else event)
            else:
                bullet(str(dl))

    # ── Risks ────────────────────────────────────────────────────────────────
    risks = b.get("risks") or {}
    top_risks = (risks.get("top_risks") or [])[:6]
    risk_score = risks.get("overall_score")
    if risk_score is not None or top_risks:
        section("Оценка рисков")
        if risk_score is not None:
            level = risks.get("level", "")
            para(f"Индекс риска: {risk_score}/100" + (f"  [{level.upper()}]" if level else ""))
        for r in top_risks:
            if isinstance(r, dict):
                title_r = r.get("title") or r.get("name") or ""
                desc_r  = r.get("description") or r.get("mitigation") or ""
                bullet(f"{title_r}: {desc_r}" if desc_r else title_r)
            else:
                bullet(str(r))

    # ── People & Organizations ───────────────────────────────────────────────
    people_list = b.get("people") or []
    orgs_list   = b.get("organizations") or []
    if people_list or orgs_list:
        section("Участники и организации")
        if people_list:
            names = [p.get("name") if isinstance(p, dict) else str(p) for p in people_list[:10]]
            para(f"Люди: {', '.join(names)}")
        if orgs_list:
            org_names = [o.get("name") if isinstance(o, dict) else str(o) for o in orgs_list[:10]]
            para(f"Организации: {', '.join(org_names)}")

    # ── Timeline ─────────────────────────────────────────────────────────────
    timeline = b.get("timeline") or []
    if timeline:
        section("Хронология")
        for ev in timeline[:8]:
            if isinstance(ev, dict):
                date = ev.get("date") or ev.get("timestamp") or ""
                desc = ev.get("event") or ev.get("description") or str(ev)
                bullet(f"{date}  {desc}" if date else desc)
            else:
                bullet(str(ev))

    # ── Classification banner (bottom) ───────────────────────────────────────
    story.append(Spacer(1, 6 * mm))
    story.append(HRFlowable(width=w, thickness=0.5, color=colors.HexColor("#e2e8f0"), spaceBefore=4))
    story.append(clf_table)
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph(
        "Документ сгенерирован системой KENCE.gov  ·  Локальная обработка  ·  Данные не передаются в облако",
        s_footer,
    ))

    doc.build(story)
    return buf.getvalue()


@router.post("/export/gov")
async def export_gov_brief_pdf(
    req: ExportGovBriefRequest,
    current_user: dict = Depends(get_current_user),
):
    """Generate a classified PDF brief from government_briefing agent output."""
    username = current_user.get("username", "")
    try:
        pdf_bytes = _build_gov_pdf(req, username)
    except Exception as e:
        logger.error("Gov PDF generation failed: %s", e)
        from fastapi.responses import JSONResponse
        return JSONResponse({"error": "PDF generation failed", "detail": str(e)}, status_code=500)

    asyncio.create_task(asyncio.to_thread(
        analytics_service.log_event, "gov_pdf_export",
        username=username,
        org_id=analytics_service.resolve_org_id(username),
        document_name=req.document_name,
    ))
    asyncio.create_task(asyncio.to_thread(
        audit_service.log, "export",
        username=username,
        document_name=req.document_name,
        detail={"format": "pdf", "type": "gov", "classification": req.classification},
    ))

    safe_name = (req.document_name or "doc").replace(" ", "_").replace("/", "_")[:40]
    filename = f"KENCE_Gov_Brief_{safe_name}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": _content_disposition(filename)},
    )
